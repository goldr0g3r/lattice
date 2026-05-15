//! Query parser — v0.3 PR D (`feat(search): query DSL + parser`).
//!
//! Implements the hybrid grammar locked by [ADR-0018]:
//!
//! * **Hand-rolled lexer + recursive-descent parser** produces the
//!   [`Query`] AST below. Operator precedence is `OR < AND < NOT < ATOM`,
//!   implicit AND between adjacent atoms.
//! * **Lattice-specific operators** parsed natively here:
//!   `tag:foo`, `path:Engineering/`, `created:>2026-01-01`,
//!   `updated:<=2026-05-15`. Date operators carry a [`DateOp`] and a
//!   [`chrono::NaiveDate`] so the v0.3 PR E SQLite-side executor can
//!   range-filter without re-parsing.
//! * **Free-text fallback**: bareword terms, quoted phrases (`"..."`),
//!   prefix queries (`raft*`), and fuzzy queries (`raft~` or `raft~2`)
//!   are recognised but kept generic; the v0.3 PR E executor lowers them
//!   to Tantivy's [`tantivy::query::QueryParser`] over the default-field
//!   list `title^3, body, tags`.
//! * **Errors** surface as [`SearchError::InvalidQuery`] with a byte-
//!   range span so the search modal (v0.3 PR E) can underline the bad
//!   region. `lattice-core` lifts those to
//!   `LatticeError::InvalidQuery` for the renderer.
//!
//! The AST is `#[non_exhaustive]` so the v0.9 plugin SDK can add new
//! field operators without forcing a major-version bump on this crate.
//!
//! [ADR-0018]: https://github.com/goldr0g3r/lattice/blob/main/docs/decisions/0018-search-query-grammar.md

use std::fmt;
use std::ops::Range;

use chrono::NaiveDate;

use crate::error::SearchError;

/// Default fields the free-text portion of a query scores against, in
/// the order [`tantivy::query::QueryParser`] receives them. The `^3` on
/// `title` is locked by [ADR-0018]; the v0.3 PR E executor reproduces
/// it via `QueryParser::set_field_boost`.
pub const DEFAULT_FIELDS: &[&str] = &["title", "body", "tags"];

/// Title field boost — appended to `title` in the query-parser
/// default-fields list to bias exact-title matches above body matches.
pub const TITLE_BOOST: f32 = 3.0;

/// Default fuzzy edit-distance when none is provided (`raft~`).
pub const DEFAULT_FUZZY_DISTANCE: u8 = 1;

/// One node in the query AST. `#[non_exhaustive]` so we can grow new
/// field operators in v0.9 plugins without a breaking change.
#[derive(Debug, Clone, PartialEq, Eq)]
#[non_exhaustive]
pub enum Query {
    /// Matches every indexed document. Produced by the empty string
    /// `""` and by the literal `*` token.
    All,
    /// Bareword term against the default field set.
    Term(String),
    /// Quoted phrase — exact token-sequence match.
    Phrase(String),
    /// `foo*` — prefix match.
    Prefix(String),
    /// `foo~` / `foo~2` — Levenshtein fuzzy with edit distance.
    Fuzzy {
        /// The term to fuzzy-match.
        term: String,
        /// Maximum edit distance. Defaults to
        /// [`DEFAULT_FUZZY_DISTANCE`] when the user writes `foo~`.
        distance: u8,
    },
    /// `field:inner` — scope an inner query to a single field. The
    /// inner [`Query`] is always a [`Query::Term`], [`Query::Phrase`],
    /// [`Query::Prefix`], or [`Query::Fuzzy`] — the parser refuses
    /// nested groups inside a field scope to keep the surface
    /// teachable.
    Field {
        /// Field name (e.g., `"tag"`, `"path"`, or any indexed name).
        field: String,
        /// The inner atom.
        value: Box<Query>,
    },
    /// `created:>2026-01-01`, `updated:<=2026-05-15`, etc. Date queries
    /// live outside the inverted index — the v0.3 PR E executor joins
    /// against the SQLite `notes.created` / `notes.updated` columns.
    Date {
        /// Date field name — `"created"` or `"updated"` for v0.3.
        field: String,
        /// Comparison operator.
        op: DateOp,
        /// RFC 3339 date (date-only resolution).
        date: NaiveDate,
    },
    /// Conjunction. Holds ≥ 2 children — the parser flattens nested
    /// `And`s so `a b c` produces one `And(vec![a, b, c])`.
    And(Vec<Query>),
    /// Disjunction. Holds ≥ 2 children — same flattening rule.
    Or(Vec<Query>),
    /// Negation — `-foo`, `-"phrase"`, `-tag:foo`.
    Not(Box<Query>),
}

/// Date comparison operator. Maps directly to a SQL `WHERE` clause in
/// the v0.3 PR E executor.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DateOp {
    /// `>` — strictly after.
    Gt,
    /// `>=` — on or after.
    Ge,
    /// `<` — strictly before.
    Lt,
    /// `<=` — on or before.
    Le,
    /// `=` (or `:`) — exact match.
    Eq,
}

impl fmt::Display for DateOp {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            DateOp::Gt => ">",
            DateOp::Ge => ">=",
            DateOp::Lt => "<",
            DateOp::Le => "<=",
            DateOp::Eq => "=",
        })
    }
}

/// Parse a query string into a [`Query`] AST. Returns
/// [`SearchError::InvalidQuery`] with a byte-range span when the input
/// can't be parsed; the search modal renders the span by underlining
/// the slice between `span.start` and `span.end` in the input.
///
/// An empty (or whitespace-only) input parses to [`Query::All`] —
/// matches every document — so the search modal can show the recent-
/// notes list with the same code path.
pub fn parse(input: &str) -> Result<Query, SearchError> {
    let tokens = lex(input)?;
    let mut parser = Parser {
        tokens: &tokens,
        cursor: 0,
        input,
    };
    let q = parser.parse_or()?;
    if !parser.at_end() {
        let span = parser.peek_span();
        return Err(SearchError::InvalidQuery {
            query: input.to_string(),
            span: span.start..span.end,
            reason: format!(
                "unexpected token at column {}: `{}`",
                span.start,
                &input[span.clone()].trim()
            ),
        });
    }
    Ok(q)
}

// =========================================================================
// Lexer
// =========================================================================

#[derive(Debug, Clone, PartialEq, Eq)]
enum Tok {
    Ident,
    Quoted,
    Colon,
    Wildcard, // *
    Tilde,    // ~
    Lt,
    Le,
    Gt,
    Ge,
    Eq,
    LParen,
    RParen,
    Minus,
    Or,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Token {
    kind: Tok,
    span: Range<usize>,
    /// Decoded text for `Ident` (with `\` escapes resolved for `Quoted`).
    text: String,
}

fn lex(input: &str) -> Result<Vec<Token>, SearchError> {
    let bytes = input.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        let start = i;
        let c = bytes[i] as char;
        match c {
            // Whitespace separates tokens but isn't a token itself.
            c if c.is_whitespace() => {
                i += 1;
                continue;
            }
            '"' => {
                i += 1;
                let mut buf = String::new();
                let mut closed = false;
                while i < bytes.len() {
                    let ch = bytes[i] as char;
                    if ch == '\\' && i + 1 < bytes.len() {
                        // `\"` and `\\` escapes — pulldown-style.
                        let nxt = bytes[i + 1] as char;
                        if nxt == '"' || nxt == '\\' {
                            buf.push(nxt);
                            i += 2;
                            continue;
                        }
                    }
                    if ch == '"' {
                        closed = true;
                        i += 1;
                        break;
                    }
                    buf.push(ch);
                    i += 1;
                }
                if !closed {
                    return Err(SearchError::InvalidQuery {
                        query: input.to_string(),
                        span: start..i,
                        reason: "unterminated quoted string".into(),
                    });
                }
                out.push(Token {
                    kind: Tok::Quoted,
                    span: start..i,
                    text: buf,
                });
            }
            '(' => {
                out.push(Token {
                    kind: Tok::LParen,
                    span: start..start + 1,
                    text: String::new(),
                });
                i += 1;
            }
            ')' => {
                out.push(Token {
                    kind: Tok::RParen,
                    span: start..start + 1,
                    text: String::new(),
                });
                i += 1;
            }
            ':' => {
                out.push(Token {
                    kind: Tok::Colon,
                    span: start..start + 1,
                    text: String::new(),
                });
                i += 1;
            }
            '*' => {
                out.push(Token {
                    kind: Tok::Wildcard,
                    span: start..start + 1,
                    text: String::new(),
                });
                i += 1;
            }
            '~' => {
                out.push(Token {
                    kind: Tok::Tilde,
                    span: start..start + 1,
                    text: String::new(),
                });
                i += 1;
            }
            '<' => {
                if i + 1 < bytes.len() && bytes[i + 1] as char == '=' {
                    out.push(Token {
                        kind: Tok::Le,
                        span: start..start + 2,
                        text: String::new(),
                    });
                    i += 2;
                } else {
                    out.push(Token {
                        kind: Tok::Lt,
                        span: start..start + 1,
                        text: String::new(),
                    });
                    i += 1;
                }
            }
            '>' => {
                if i + 1 < bytes.len() && bytes[i + 1] as char == '=' {
                    out.push(Token {
                        kind: Tok::Ge,
                        span: start..start + 2,
                        text: String::new(),
                    });
                    i += 2;
                } else {
                    out.push(Token {
                        kind: Tok::Gt,
                        span: start..start + 1,
                        text: String::new(),
                    });
                    i += 1;
                }
            }
            '=' => {
                out.push(Token {
                    kind: Tok::Eq,
                    span: start..start + 1,
                    text: String::new(),
                });
                i += 1;
            }
            '-' => {
                // `-` at the start of a token is always negation. A
                // dash *inside* an identifier (e.g. `bge-small`,
                // `2026-01-01`) is glued by the ident loop below; we
                // never reach this arm in that case.
                out.push(Token {
                    kind: Tok::Minus,
                    span: start..start + 1,
                    text: String::new(),
                });
                i += 1;
            }
            _ => {
                // Identifier — read until whitespace or a special
                // delimiter. Internal `-` is allowed when it sits
                // between two word characters (so `bge-small` and
                // `2026-01-01` lex as one token, but a trailing `-`
                // or `-` followed by a separator terminates).
                let mut buf = String::new();
                while i < bytes.len() {
                    let ch = bytes[i] as char;
                    if ch.is_whitespace() || is_terminator(ch) {
                        break;
                    }
                    if ch == '-' {
                        let next_is_word = bytes
                            .get(i + 1)
                            .map(|b| {
                                let c = *b as char;
                                c.is_alphanumeric() || c == '_' || c == '-'
                            })
                            .unwrap_or(false);
                        if !next_is_word {
                            break;
                        }
                    }
                    buf.push(ch);
                    i += 1;
                }
                // `OR` (uppercase) is the disjunction keyword; lower-
                // case `or` is a normal term so users can search for
                // notes literally about an "or" without escaping.
                if buf == "OR" {
                    out.push(Token {
                        kind: Tok::Or,
                        span: start..i,
                        text: String::new(),
                    });
                } else {
                    out.push(Token {
                        kind: Tok::Ident,
                        span: start..i,
                        text: buf,
                    });
                }
            }
        }
    }
    Ok(out)
}

fn is_terminator(c: char) -> bool {
    matches!(c, '(' | ')' | ':' | '*' | '~' | '<' | '>' | '=' | '"')
}

// =========================================================================
// Parser
// =========================================================================

struct Parser<'a> {
    tokens: &'a [Token],
    cursor: usize,
    input: &'a str,
}

impl<'a> Parser<'a> {
    fn at_end(&self) -> bool {
        self.cursor >= self.tokens.len()
    }

    fn peek(&self) -> Option<&'a Token> {
        self.tokens.get(self.cursor)
    }

    fn peek_kind(&self) -> Option<&Tok> {
        self.peek().map(|t| &t.kind)
    }

    fn peek_span(&self) -> Range<usize> {
        self.peek()
            .map(|t| t.span.clone())
            .unwrap_or(self.input.len()..self.input.len())
    }

    fn bump(&mut self) -> &'a Token {
        let t = &self.tokens[self.cursor];
        self.cursor += 1;
        t
    }

    fn expect(&mut self, kind: Tok, what: &str) -> Result<&'a Token, SearchError> {
        match self.peek() {
            Some(t) if t.kind == kind => Ok(self.bump()),
            Some(t) => Err(self.error_at(
                t.span.clone(),
                format!("expected {what}, got `{}`", &self.input[t.span.clone()]),
            )),
            None => Err(self.error_at(
                self.input.len()..self.input.len(),
                format!("expected {what}, got end of input"),
            )),
        }
    }

    fn error_at(&self, span: Range<usize>, reason: String) -> SearchError {
        SearchError::InvalidQuery {
            query: self.input.to_string(),
            span,
            reason,
        }
    }

    fn parse_or(&mut self) -> Result<Query, SearchError> {
        if self.at_end() {
            return Ok(Query::All);
        }
        let first = self.parse_and()?;
        let mut alts = vec![first];
        while matches!(self.peek_kind(), Some(Tok::Or)) {
            self.bump();
            alts.push(self.parse_and()?);
        }
        Ok(flatten_or(alts))
    }

    fn parse_and(&mut self) -> Result<Query, SearchError> {
        let first = self.parse_not()?;
        let mut terms = vec![first];
        // Implicit AND — keep eating atoms until we hit a terminator
        // (Or / RParen / end).
        while let Some(k) = self.peek_kind() {
            if matches!(k, Tok::Or | Tok::RParen) {
                break;
            }
            terms.push(self.parse_not()?);
        }
        Ok(flatten_and(terms))
    }

    fn parse_not(&mut self) -> Result<Query, SearchError> {
        if matches!(self.peek_kind(), Some(Tok::Minus)) {
            self.bump();
            // Recurse so `--foo` collapses to `foo` per double-negation.
            let inner = self.parse_not()?;
            if let Query::Not(boxed) = inner {
                Ok(*boxed)
            } else {
                Ok(Query::Not(Box::new(inner)))
            }
        } else {
            self.parse_atom()
        }
    }

    fn parse_atom(&mut self) -> Result<Query, SearchError> {
        let Some(t) = self.peek() else {
            return Err(self.error_at(
                self.input.len()..self.input.len(),
                "expected a term, got end of input".into(),
            ));
        };
        match &t.kind {
            Tok::LParen => {
                self.bump();
                let inner = self.parse_or()?;
                self.expect(Tok::RParen, "closing `)`")?;
                Ok(inner)
            }
            Tok::Ident => {
                // Could be `field:value` or `term*` or `term~n` or
                // a bareword.
                let ident_tok = self.bump().clone();
                if matches!(self.peek_kind(), Some(Tok::Colon)) {
                    self.bump();
                    self.parse_field_value(&ident_tok)
                } else {
                    Ok(self.finish_terminal(&ident_tok))
                }
            }
            Tok::Quoted => {
                let qtok = self.bump();
                Ok(Query::Phrase(qtok.text.clone()))
            }
            Tok::Wildcard => {
                // Bare `*` matches everything.
                self.bump();
                Ok(Query::All)
            }
            other => {
                let span = t.span.clone();
                Err(self.error_at(
                    span.clone(),
                    format!("unexpected token `{}` (kind {other:?})", &self.input[span]),
                ))
            }
        }
    }

    /// `field:value` body — `value` is one of: a date op + date,
    /// a quoted phrase, a bareword (with optional `*` or `~n`).
    fn parse_field_value(&mut self, ident: &Token) -> Result<Query, SearchError> {
        // Date operator family — only valid for date fields.
        if matches!(
            self.peek_kind(),
            Some(Tok::Gt | Tok::Ge | Tok::Lt | Tok::Le | Tok::Eq)
        ) {
            // Reject non-date fields BEFORE we try to parse what
            // follows as a date — gives a clearer error.
            if !is_date_field(&ident.text) {
                return Err(self.error_at(
                    ident.span.clone(),
                    format!(
                        "field `{}` does not accept a date comparison \
                         (use `created` or `updated`)",
                        ident.text
                    ),
                ));
            }
            let op_tok = self.bump().clone();
            let op = match op_tok.kind {
                Tok::Gt => DateOp::Gt,
                Tok::Ge => DateOp::Ge,
                Tok::Lt => DateOp::Lt,
                Tok::Le => DateOp::Le,
                Tok::Eq => DateOp::Eq,
                _ => unreachable!(),
            };
            let date_tok = self.expect(Tok::Ident, "a YYYY-MM-DD date")?;
            let date = parse_date(&date_tok.text)
                .map_err(|reason| self.error_at(date_tok.span.clone(), reason))?;
            return Ok(Query::Date {
                field: ident.text.clone(),
                op,
                date,
            });
        }

        // Implicit date equality — `created:2026-01-01` (no operator
        // means `=`). Only fires for date fields with a date-shaped
        // identifier value.
        if is_date_field(&ident.text) {
            if let Some(t) = self.peek() {
                if matches!(t.kind, Tok::Ident) && looks_like_date(&t.text) {
                    let date_tok = self.bump().clone();
                    let date = parse_date(&date_tok.text)
                        .map_err(|reason| self.error_at(date_tok.span, reason))?;
                    return Ok(Query::Date {
                        field: ident.text.clone(),
                        op: DateOp::Eq,
                        date,
                    });
                }
            }
        }

        // Otherwise: a normal value (quoted phrase, prefix, fuzzy, or
        // bareword) scoped to the field.
        let value = match self.peek_kind() {
            Some(Tok::Quoted) => {
                let qtok = self.bump();
                Query::Phrase(qtok.text.clone())
            }
            Some(Tok::Ident) => {
                let v_tok = self.bump().clone();
                self.finish_terminal(&v_tok)
            }
            other => {
                let span = self.peek_span();
                return Err(self.error_at(
                    span,
                    format!(
                        "expected a value after `{}:`, got `{:?}`",
                        ident.text, other
                    ),
                ));
            }
        };
        Ok(Query::Field {
            field: ident.text.clone(),
            value: Box::new(value),
        })
    }

    /// Apply trailing `*` (prefix) / `~n` (fuzzy) to a bareword.
    fn finish_terminal(&mut self, term: &Token) -> Query {
        // Prefix — `foo*` (the `*` token is glued, but we only require
        // it appear at the next cursor position with the previous token
        // ending right where the wildcard starts).
        if matches!(self.peek_kind(), Some(Tok::Wildcard))
            && self.peek().map(|t| t.span.start) == Some(term.span.end)
        {
            self.bump();
            return Query::Prefix(term.text.clone());
        }
        // Fuzzy — `foo~` or `foo~2`. Same gluing rule.
        if matches!(self.peek_kind(), Some(Tok::Tilde))
            && self.peek().map(|t| t.span.start) == Some(term.span.end)
        {
            self.bump();
            // Optional distance immediately after.
            let distance = if let Some(t) = self.peek() {
                if matches!(t.kind, Tok::Ident) {
                    if let Ok(n) = t.text.parse::<u8>() {
                        self.bump();
                        n.min(2) // Tantivy fuzzy caps at 2; we mirror.
                    } else {
                        DEFAULT_FUZZY_DISTANCE
                    }
                } else {
                    DEFAULT_FUZZY_DISTANCE
                }
            } else {
                DEFAULT_FUZZY_DISTANCE
            };
            return Query::Fuzzy {
                term: term.text.clone(),
                distance,
            };
        }
        Query::Term(term.text.clone())
    }
}

fn is_date_field(s: &str) -> bool {
    matches!(s, "created" | "updated")
}

fn looks_like_date(s: &str) -> bool {
    s.len() == 10 && s.as_bytes().get(4) == Some(&b'-') && s.as_bytes().get(7) == Some(&b'-')
}

fn parse_date(s: &str) -> Result<NaiveDate, String> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d")
        .map_err(|err| format!("invalid date `{s}`: {err} (expected YYYY-MM-DD)"))
}

fn flatten_and(items: Vec<Query>) -> Query {
    let mut out = Vec::with_capacity(items.len());
    for it in items {
        if let Query::And(inner) = it {
            out.extend(inner);
        } else {
            out.push(it);
        }
    }
    match out.len() {
        0 => Query::All,
        1 => out.into_iter().next().expect("checked len = 1"),
        _ => Query::And(out),
    }
}

fn flatten_or(items: Vec<Query>) -> Query {
    let mut out = Vec::with_capacity(items.len());
    for it in items {
        if let Query::Or(inner) = it {
            out.extend(inner);
        } else {
            out.push(it);
        }
    }
    match out.len() {
        0 => Query::All,
        1 => out.into_iter().next().expect("checked len = 1"),
        _ => Query::Or(out),
    }
}

// =========================================================================
// Tests
// =========================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn d(s: &str) -> NaiveDate {
        NaiveDate::parse_from_str(s, "%Y-%m-%d").unwrap()
    }

    // ---- AST snapshot corpus (~20 representative queries, per issue #42).

    #[test]
    fn empty_query_matches_all() {
        assert_eq!(parse("").unwrap(), Query::All);
        assert_eq!(parse("   ").unwrap(), Query::All);
        assert_eq!(parse("*").unwrap(), Query::All);
    }

    #[test]
    fn bareword_is_term() {
        assert_eq!(parse("raft").unwrap(), Query::Term("raft".into()));
    }

    #[test]
    fn two_words_are_implicit_and() {
        assert_eq!(
            parse("raft paxos").unwrap(),
            Query::And(vec![
                Query::Term("raft".into()),
                Query::Term("paxos".into())
            ])
        );
    }

    #[test]
    fn three_words_flatten_to_single_and() {
        assert_eq!(
            parse("raft paxos viewstamped").unwrap(),
            Query::And(vec![
                Query::Term("raft".into()),
                Query::Term("paxos".into()),
                Query::Term("viewstamped".into()),
            ])
        );
    }

    #[test]
    fn or_keyword_disjoins() {
        assert_eq!(
            parse("raft OR paxos").unwrap(),
            Query::Or(vec![
                Query::Term("raft".into()),
                Query::Term("paxos".into())
            ])
        );
    }

    #[test]
    fn lowercase_or_is_a_normal_term() {
        // Users typing literally about "or" shouldn't have to escape.
        assert_eq!(
            parse("raft or paxos").unwrap(),
            Query::And(vec![
                Query::Term("raft".into()),
                Query::Term("or".into()),
                Query::Term("paxos".into()),
            ])
        );
    }

    #[test]
    fn precedence_or_below_and() {
        // `a b OR c` → (a AND b) OR c
        assert_eq!(
            parse("a b OR c").unwrap(),
            Query::Or(vec![
                Query::And(vec![Query::Term("a".into()), Query::Term("b".into())]),
                Query::Term("c".into()),
            ])
        );
    }

    #[test]
    fn parens_override_precedence() {
        // `a (b OR c)` → a AND (b OR c)
        assert_eq!(
            parse("a (b OR c)").unwrap(),
            Query::And(vec![
                Query::Term("a".into()),
                Query::Or(vec![Query::Term("b".into()), Query::Term("c".into())])
            ])
        );
    }

    #[test]
    fn negation_wraps_atom() {
        assert_eq!(
            parse("-foo").unwrap(),
            Query::Not(Box::new(Query::Term("foo".into())))
        );
    }

    #[test]
    fn double_negation_cancels() {
        assert_eq!(parse("--foo").unwrap(), Query::Term("foo".into()));
    }

    #[test]
    fn dashed_identifier_is_one_term() {
        // `bge-small` should be a single term, not `bge AND NOT small`.
        assert_eq!(parse("bge-small").unwrap(), Query::Term("bge-small".into()));
    }

    #[test]
    fn quoted_phrase() {
        assert_eq!(
            parse("\"distributed systems\"").unwrap(),
            Query::Phrase("distributed systems".into())
        );
    }

    #[test]
    fn quoted_phrase_with_escape() {
        assert_eq!(
            parse("\"he said \\\"hi\\\"\"").unwrap(),
            Query::Phrase("he said \"hi\"".into())
        );
    }

    #[test]
    fn prefix_query() {
        assert_eq!(parse("raft*").unwrap(), Query::Prefix("raft".into()));
    }

    #[test]
    fn fuzzy_default_distance() {
        assert_eq!(
            parse("raft~").unwrap(),
            Query::Fuzzy {
                term: "raft".into(),
                distance: DEFAULT_FUZZY_DISTANCE
            }
        );
    }

    #[test]
    fn fuzzy_explicit_distance() {
        assert_eq!(
            parse("raft~2").unwrap(),
            Query::Fuzzy {
                term: "raft".into(),
                distance: 2
            }
        );
    }

    #[test]
    fn fuzzy_distance_caps_at_two() {
        // Tantivy fuzzy caps at edit distance 2; we mirror.
        assert_eq!(
            parse("raft~9").unwrap(),
            Query::Fuzzy {
                term: "raft".into(),
                distance: 2
            }
        );
    }

    #[test]
    fn field_scoped_term() {
        assert_eq!(
            parse("tag:foo").unwrap(),
            Query::Field {
                field: "tag".into(),
                value: Box::new(Query::Term("foo".into()))
            }
        );
    }

    #[test]
    fn field_scoped_phrase() {
        assert_eq!(
            parse("path:\"Engineering/Notes\"").unwrap(),
            Query::Field {
                field: "path".into(),
                value: Box::new(Query::Phrase("Engineering/Notes".into()))
            }
        );
    }

    #[test]
    fn field_scoped_prefix() {
        // path:Engineering* is a prefix scoped to the path field.
        assert_eq!(
            parse("path:Engineering*").unwrap(),
            Query::Field {
                field: "path".into(),
                value: Box::new(Query::Prefix("Engineering".into()))
            }
        );
    }

    #[test]
    fn date_greater_than() {
        assert_eq!(
            parse("created:>2026-01-01").unwrap(),
            Query::Date {
                field: "created".into(),
                op: DateOp::Gt,
                date: d("2026-01-01")
            }
        );
    }

    #[test]
    fn date_less_or_equal() {
        assert_eq!(
            parse("updated:<=2026-05-15").unwrap(),
            Query::Date {
                field: "updated".into(),
                op: DateOp::Le,
                date: d("2026-05-15")
            }
        );
    }

    #[test]
    fn date_implicit_equality_with_colon_only() {
        // `created:2026-01-01` is shorthand for `created:=2026-01-01`.
        assert_eq!(
            parse("created:2026-01-01").unwrap(),
            Query::Date {
                field: "created".into(),
                op: DateOp::Eq,
                date: d("2026-01-01")
            }
        );
    }

    #[test]
    fn negated_field_query() {
        assert_eq!(
            parse("-tag:draft").unwrap(),
            Query::Not(Box::new(Query::Field {
                field: "tag".into(),
                value: Box::new(Query::Term("draft".into()))
            }))
        );
    }

    #[test]
    fn complex_combined_query() {
        // raft OR paxos tag:distributed -draft "consensus algorithm" created:>2026-01-01
        let q = parse(
            "raft OR paxos tag:distributed -draft \"consensus algorithm\" created:>2026-01-01",
        )
        .unwrap();
        // `OR` has lower precedence than implicit AND; so this groups as:
        //   raft OR (paxos AND tag:distributed AND -draft AND "consensus algorithm"
        //            AND created:>2026-01-01)
        assert_eq!(
            q,
            Query::Or(vec![
                Query::Term("raft".into()),
                Query::And(vec![
                    Query::Term("paxos".into()),
                    Query::Field {
                        field: "tag".into(),
                        value: Box::new(Query::Term("distributed".into()))
                    },
                    Query::Not(Box::new(Query::Term("draft".into()))),
                    Query::Phrase("consensus algorithm".into()),
                    Query::Date {
                        field: "created".into(),
                        op: DateOp::Gt,
                        date: d("2026-01-01")
                    },
                ])
            ])
        );
    }

    // ---- Error cases.

    #[test]
    fn unterminated_quote_errors_with_span() {
        let err = parse("\"oops").unwrap_err();
        match err {
            SearchError::InvalidQuery { span, reason, .. } => {
                assert_eq!(span, 0..5);
                assert!(reason.contains("unterminated"));
            }
            _ => panic!("expected InvalidQuery"),
        }
    }

    #[test]
    fn unclosed_paren_errors() {
        let err = parse("(a b").unwrap_err();
        assert!(matches!(err, SearchError::InvalidQuery { .. }));
    }

    #[test]
    fn unbalanced_close_paren_errors() {
        let err = parse("a)").unwrap_err();
        assert!(matches!(err, SearchError::InvalidQuery { .. }));
    }

    #[test]
    fn bad_date_errors_with_span() {
        let err = parse("created:>not-a-date").unwrap_err();
        match err {
            SearchError::InvalidQuery { span, reason, .. } => {
                // Span should cover the bad date text.
                assert_eq!(span.start, 9);
                assert!(reason.contains("YYYY-MM-DD") || reason.contains("invalid date"));
            }
            _ => panic!("expected InvalidQuery"),
        }
    }

    #[test]
    fn date_op_on_non_date_field_errors() {
        let err = parse("tag:>foo").unwrap_err();
        match err {
            SearchError::InvalidQuery { reason, .. } => {
                assert!(
                    reason.contains("does not accept a date"),
                    "unexpected reason: {reason}"
                );
            }
            _ => panic!("expected InvalidQuery"),
        }
    }

    #[test]
    fn empty_field_value_errors() {
        let err = parse("tag:").unwrap_err();
        assert!(matches!(err, SearchError::InvalidQuery { .. }));
    }

    // ---- Whitespace / edge cases.

    #[test]
    fn extra_whitespace_does_not_change_ast() {
        assert_eq!(
            parse("   raft   paxos   ").unwrap(),
            parse("raft paxos").unwrap()
        );
    }

    #[test]
    fn nested_parens() {
        assert_eq!(
            parse("((a OR b) OR c)").unwrap(),
            Query::Or(vec![
                Query::Term("a".into()),
                Query::Term("b".into()),
                Query::Term("c".into()),
            ])
        );
    }

    // ---- Sanity: default field constants haven't drifted from ADR-0018.
    #[test]
    fn default_fields_match_adr_0018() {
        assert_eq!(DEFAULT_FIELDS, &["title", "body", "tags"]);
        assert!((TITLE_BOOST - 3.0).abs() < f32::EPSILON);
    }
}
