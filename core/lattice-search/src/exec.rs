//! Query execution — v0.3 PR E (`feat(ui): search modal`).
//!
//! Lowers a parsed [`crate::Query`] AST into a `tantivy::query::Query`,
//! executes it against the index, and packages the top hits as
//! [`SearchHit`]s with snippet highlights.
//!
//! Date queries (`created:>2026-01-01` etc.) are **not** lowered to
//! Tantivy — they live outside the inverted index per [ADR-0018]. v0.3
//! PR E ignores them silently in mixed queries (the text predicates
//! still apply); a follow-up PR will add the SQLite-side join that
//! actually filters by `notes.created` / `notes.updated`.
//!
//! [ADR-0018]: https://github.com/goldr0g3r/lattice/blob/main/docs/decisions/0018-search-query-grammar.md

use std::collections::HashSet;
use std::time::Instant;

use tantivy::collector::{Count, TopDocs};
use tantivy::query::{
    AllQuery, BooleanQuery, FuzzyTermQuery, Occur, PhraseQuery, Query as TantivyQuery,
    QueryParser, RegexQuery, TermQuery,
};
use tantivy::schema::{Field, IndexRecordOption, Schema, TantivyDocument, Value};
use tantivy::snippet::SnippetGenerator;
use tantivy::tokenizer::TextAnalyzer;
use tantivy::Term;

use crate::error::{SearchError, SearchResult};
use crate::hit::{SearchHit, SearchResults};
use crate::query::{Query, TITLE_BOOST};
use crate::schema::{Fields, BODY_TOKENIZER, TITLE_TOKENIZER};

/// Hard ceiling on `limit` — the modal's first paint budget can't display
/// more anyway, and this caps the snippet-generation cost.
pub const SEARCH_LIMIT_MAX: u32 = 200;

pub(crate) fn execute(
    inner: &tantivy::Index,
    reader: &tantivy::IndexReader,
    fields: Fields,
    query: &Query,
    limit: u32,
) -> SearchResult<SearchResults> {
    let started = Instant::now();
    let limit = limit.clamp(1, SEARCH_LIMIT_MAX) as usize;

    let schema = inner.schema();
    let tantivy_query = lower(inner, &schema, fields, query)?;

    let searcher = reader.searcher();
    let top = searcher.search(
        &*tantivy_query,
        &TopDocs::with_limit(limit).order_by_score(),
    )?;
    let total = searcher.search(&*tantivy_query, &Count)? as u64;

    // Snippet generator targeted at the `body` field. We instantiate it
    // once per query; passing it through to each hit is much cheaper than
    // generating a fresh snippet per address.
    let snippeter = SnippetGenerator::create(&searcher, &*tantivy_query, fields.body).ok();

    let mut hits = Vec::with_capacity(top.len());
    for (score, address) in top {
        let doc: TantivyDocument = searcher.doc(address)?;
        let id = pluck_string(&doc, fields.id).unwrap_or_default();
        let path = pluck_string(&doc, fields.path).unwrap_or_default();
        let title = pluck_string(&doc, fields.title).unwrap_or_default();
        let snippet = if let Some(g) = snippeter.as_ref() {
            let s = g.snippet_from_doc(&doc);
            if s.is_empty() {
                String::new()
            } else {
                s.to_html()
            }
        } else {
            String::new()
        };
        hits.push(SearchHit {
            id,
            path,
            title,
            snippet,
            score,
        });
    }

    let elapsed_ms = u32::try_from(started.elapsed().as_millis()).unwrap_or(u32::MAX);
    Ok(SearchResults {
        truncated: total > hits.len() as u64,
        hits,
        total,
        elapsed_ms,
    })
}

/// Lower a [`Query`] AST into a `tantivy::query::Query`. Returns the
/// boxed trait object the searcher consumes.
pub fn lower(
    inner: &tantivy::Index,
    schema: &Schema,
    fields: Fields,
    query: &Query,
) -> SearchResult<Box<dyn TantivyQuery>> {
    match query {
        Query::All => Ok(Box::new(AllQuery)),
        Query::Term(t) => lower_terms_default(inner, fields, t),
        Query::Phrase(phrase) => lower_phrase(inner, schema, fields, phrase),
        Query::Prefix(prefix) => lower_prefix_default(fields, prefix),
        Query::Fuzzy { term, distance } => lower_fuzzy_default(fields, term, *distance),
        Query::Field { field, value } => lower_field_scoped(inner, schema, fields, field, value),
        Query::Date { .. } => {
            // Date predicates live outside the inverted index — we don't
            // express them as a Tantivy query, just match nothing on
            // their own so a date-only query returns no results until
            // the SQLite join lands. In mixed queries (e.g.,
            // `paxos created:>2026-01-01`), the surrounding And/Or
            // arms keep the text portion working.
            //
            // The choice of "match nothing" over "match everything" is
            // safer: a user who types `created:>2026-01-01` and sees
            // zero results will retry; a user who types it and sees
            // everything would be misled.
            Ok(Box::new(BooleanQuery::new(Vec::new())))
        }
        Query::And(items) => lower_boolean(inner, schema, fields, items, Occur::Must),
        Query::Or(items) => lower_boolean(inner, schema, fields, items, Occur::Should),
        Query::Not(inner_q) => {
            let inner_tq = lower(inner, schema, fields, inner_q)?;
            // A pure NOT needs something to subtract from — pair it with
            // a Must AllQuery so the searcher returns all docs that
            // don't match the inner.
            let bq = BooleanQuery::new(vec![
                (Occur::Must, Box::new(AllQuery) as Box<dyn TantivyQuery>),
                (Occur::MustNot, inner_tq),
            ]);
            Ok(Box::new(bq))
        }
    }
}

// =========================================================================
// Lowering helpers
// =========================================================================

fn lower_boolean(
    inner: &tantivy::Index,
    schema: &Schema,
    fields: Fields,
    items: &[Query],
    occur: Occur,
) -> SearchResult<Box<dyn TantivyQuery>> {
    let mut clauses: Vec<(Occur, Box<dyn TantivyQuery>)> = Vec::with_capacity(items.len());
    for item in items {
        // Skip Date clauses inside boolean compositions for now — see
        // the comment on `Query::Date` in `lower`.
        if matches!(item, Query::Date { .. }) {
            continue;
        }
        clauses.push((occur, lower(inner, schema, fields, item)?));
    }
    if clauses.is_empty() {
        return Ok(Box::new(AllQuery));
    }
    if clauses.len() == 1 {
        // Avoid wrapping a single clause in a BooleanQuery — the
        // searcher's BM25 scoring on a bare leaf is more accurate than
        // a single-clause BooleanQuery wrapper.
        let (_, q) = clauses.into_iter().next().expect("checked len = 1");
        return Ok(q);
    }
    Ok(Box::new(BooleanQuery::new(clauses)))
}

fn lower_terms_default(
    inner: &tantivy::Index,
    fields: Fields,
    text: &str,
) -> SearchResult<Box<dyn TantivyQuery>> {
    // Free-text barewords ride through Tantivy's QueryParser over the
    // locked default-fields list. This preserves QueryParser's
    // well-tested escape + boost semantics for the common case.
    let parser = build_default_query_parser(inner, fields);
    let q = parser
        .parse_query(text)
        .map_err(|e| query_parser_err(text, e))?;
    Ok(q)
}

fn lower_phrase(
    inner: &tantivy::Index,
    schema: &Schema,
    fields: Fields,
    phrase: &str,
) -> SearchResult<Box<dyn TantivyQuery>> {
    // A phrase scoped to the default fields. Tantivy's QueryParser
    // already supports phrase syntax — re-quote and reuse.
    let escaped = escape_for_query_parser(phrase);
    let quoted = format!("\"{escaped}\"");
    lower_terms_default(inner, fields, &quoted)
        .or_else(|_| {
            // Some tokenizers refuse phrase parsing; fall back to a
            // BoostQuery over a body PhraseQuery built by hand.
            let body_terms = tokens_for_field(inner, schema, fields.body, phrase);
            if body_terms.is_empty() {
                Ok(Box::new(AllQuery) as Box<dyn TantivyQuery>)
            } else if body_terms.len() == 1 {
                Ok(Box::new(TermQuery::new(
                    body_terms.into_iter().next().expect("checked"),
                    IndexRecordOption::WithFreqsAndPositions,
                )))
            } else {
                Ok(Box::new(PhraseQuery::new(body_terms)))
            }
        })
}

fn lower_prefix_default(
    fields: Fields,
    prefix: &str,
) -> SearchResult<Box<dyn TantivyQuery>> {
    // Approximated as `prefix*` over the body field via regex. We avoid
    // pulling in PrefixQuery (which Tantivy 0.26 doesn't expose for
    // text fields) and let the regex run on body — the most common
    // prefix-search target.
    let escaped = regex_escape(prefix.to_lowercase());
    let pattern = format!("{escaped}.*");
    let rq = RegexQuery::from_pattern(&pattern, fields.body)
        .map_err(|e| SearchError::InvalidQuery {
            query: prefix.to_string(),
            span: 0..prefix.len(),
            reason: format!("invalid prefix regex: {e}"),
        })?;
    Ok(Box::new(rq))
}

fn lower_fuzzy_default(
    fields: Fields,
    term: &str,
    distance: u8,
) -> SearchResult<Box<dyn TantivyQuery>> {
    // Fuzzy is applied against the body field — the most common case;
    // title fuzzy is rare. We lowercase to match the default tokenizer's
    // pipeline.
    let term_lc = term.to_lowercase();
    let tantivy_term = Term::from_field_text(fields.body, &term_lc);
    let q = FuzzyTermQuery::new(tantivy_term, distance, true);
    Ok(Box::new(q))
}

fn lower_field_scoped(
    inner: &tantivy::Index,
    schema: &Schema,
    fields: Fields,
    field_name: &str,
    value: &Query,
) -> SearchResult<Box<dyn TantivyQuery>> {
    // Map our user-facing field aliases (`tag:`, `path:`) onto the
    // actual schema field handles.
    let target = match field_name {
        "tag" | "tags" => fields.tags,
        "path" => fields.path,
        "title" => fields.title,
        "body" => fields.body,
        "id" => fields.id,
        other => {
            return Err(SearchError::InvalidQuery {
                query: other.to_string(),
                span: 0..other.len(),
                reason: format!(
                    "unknown field `{other}` (try: tag, path, title, body, id)"
                ),
            });
        }
    };

    match value {
        Query::Term(t) => {
            // `path:Engineering/` is a prefix on the path field; bare
            // `path:Engineering/Notes.md` is exact. The trailing slash
            // is the locked v0.3 prefix marker per ADR-0018.
            if field_name == "path" && t.ends_with('/') {
                let trimmed = t.trim_end_matches('/');
                let escaped = regex_escape(trimmed);
                let pattern = format!("{escaped}/.*");
                let rq = RegexQuery::from_pattern(&pattern, target).map_err(|e| {
                    SearchError::InvalidQuery {
                        query: t.clone(),
                        span: 0..t.len(),
                        reason: format!("invalid path prefix: {e}"),
                    }
                })?;
                Ok(Box::new(rq))
            } else {
                let term = if uses_raw_tokenizer(field_name) {
                    Term::from_field_text(target, t)
                } else {
                    Term::from_field_text(target, &t.to_lowercase())
                };
                Ok(Box::new(TermQuery::new(
                    term,
                    IndexRecordOption::WithFreqs,
                )))
            }
        }
        Query::Phrase(p) => {
            let terms = tokens_for_field(inner, schema, target, p);
            if terms.is_empty() {
                Ok(Box::new(BooleanQuery::new(Vec::new())))
            } else if terms.len() == 1 {
                Ok(Box::new(TermQuery::new(
                    terms.into_iter().next().expect("len = 1"),
                    IndexRecordOption::WithFreqsAndPositions,
                )))
            } else {
                Ok(Box::new(PhraseQuery::new(terms)))
            }
        }
        Query::Prefix(p) => {
            let lower = if uses_raw_tokenizer(field_name) {
                p.to_string()
            } else {
                p.to_lowercase()
            };
            let escaped = regex_escape(&lower);
            let pattern = format!("{escaped}.*");
            let rq = RegexQuery::from_pattern(&pattern, target).map_err(|e| {
                SearchError::InvalidQuery {
                    query: p.clone(),
                    span: 0..p.len(),
                    reason: format!("invalid field-scoped prefix regex: {e}"),
                }
            })?;
            Ok(Box::new(rq))
        }
        Query::Fuzzy { term, distance } => {
            let lc = term.to_lowercase();
            let tt = Term::from_field_text(target, &lc);
            Ok(Box::new(FuzzyTermQuery::new(tt, *distance, true)))
        }
        nested => {
            // Nested boolean inside a field scope isn't allowed by the
            // parser — but if a programmatic caller builds one, lower
            // it generically.
            lower(inner, schema, fields, nested)
        }
    }
}

fn uses_raw_tokenizer(field_name: &str) -> bool {
    matches!(field_name, "tag" | "tags" | "path" | "id")
}

fn tokens_for_field(
    inner: &tantivy::Index,
    schema: &Schema,
    field: Field,
    text: &str,
) -> Vec<Term> {
    // Mirror the indexer's tokenizer choice so phrase positions line up
    // with what's actually in the inverted index. The schema's
    // `FieldType::TextFieldIndexingOptions` carries the tokenizer name
    // but the accessor path on tantivy 0.26 is `.field_type()` →
    // matchable `FieldType::Str`.
    let tokenizer_name = match schema.get_field_entry(field).field_type() {
        tantivy::schema::FieldType::Str(opts) => opts
            .get_indexing_options()
            .map(|i| i.tokenizer().to_string())
            .unwrap_or_else(|| TITLE_TOKENIZER.to_string()),
        _ => TITLE_TOKENIZER.to_string(),
    };

    let mut analyzer: TextAnalyzer = inner
        .tokenizers()
        .get(&tokenizer_name)
        .or_else(|| inner.tokenizers().get(BODY_TOKENIZER))
        .or_else(|| inner.tokenizers().get(TITLE_TOKENIZER))
        .expect("a default tokenizer must always be registered");
    let mut stream = analyzer.token_stream(text);
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    while let Some(token) = stream.next() {
        if seen.insert(token.text.clone()) {
            out.push(Term::from_field_text(field, &token.text));
        }
    }
    out
}

fn build_default_query_parser(inner: &tantivy::Index, fields: Fields) -> QueryParser {
    let mut parser = QueryParser::for_index(inner, vec![fields.title, fields.body, fields.tags]);
    parser.set_field_boost(fields.title, TITLE_BOOST);
    parser
}

fn pluck_string(doc: &TantivyDocument, field: Field) -> Option<String> {
    doc.get_first(field).and_then(|v| v.as_str()).map(str::to_string)
}

fn query_parser_err(input: &str, err: tantivy::query::QueryParserError) -> SearchError {
    SearchError::InvalidQuery {
        query: input.to_string(),
        span: 0..input.len(),
        reason: format!("tantivy query-parser: {err}"),
    }
}

fn escape_for_query_parser(s: &str) -> String {
    // The minimum set of characters QueryParser treats specially inside
    // quoted phrases: `\` and `"`. Doubling them is enough.
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        if ch == '\\' || ch == '"' {
            out.push('\\');
        }
        out.push(ch);
    }
    out
}

fn regex_escape(s: impl AsRef<str>) -> String {
    // Tantivy's regex uses standard regex syntax. Escape the common
    // metacharacters; this is conservative.
    let s = s.as_ref();
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '.' | '*' | '+' | '?' | '(' | ')' | '[' | ']' | '{' | '}' | '|' | '\\' | '^' | '$' => {
                out.push('\\');
                out.push(ch);
            }
            _ => out.push(ch),
        }
    }
    out
}
