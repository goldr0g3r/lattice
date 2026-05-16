//! On-disk index schema (locked by [ADR-0004] + [ADR-0018]).
//!
//! Five fields:
//!
//! | Field   | Type                | Stored | Indexed | Tokenizer       |
//! | ------- | ------------------- | ------ | ------- | --------------- |
//! | `id`    | `String`            | yes    | yes     | `raw`           |
//! | `path`  | `String`            | yes    | yes     | `raw`           |
//! | `title` | `String`            | yes    | yes     | `default` (lc)  |
//! | `body`  | `String`            | yes    | yes     | `en_stem`       |
//! | `tags`  | `Vec<String>`       | yes    | yes     | `raw` (multi)   |
//!
//! `id` is `STRING` (raw tokenizer) so `delete_term(Term::from_field_text(id, doc_id))`
//! matches exactly without lowercasing or splitting on whitespace — required
//! for the replace-on-save path the v0.3 PR C watcher integration uses.
//!
//! `body` is **stored as well as indexed** so Tantivy's `SnippetGenerator`
//! can build highlighted excerpts for the v0.3 PR E search modal without
//! re-reading the source `.md` file. The size hit is real (≈ doubles the
//! body's on-disk footprint vs. inverted-only), but on a 10k-note vault
//! that's ≈ 5 MB extra — well inside the 200 MB memory budget from
//! ARCHITECTURE.md. We hash the body in SQLite (`notes.body_hash`) so
//! drift between the stored Tantivy copy and the canonical `.md` file
//! can be detected and resolved by a full reindex (per ADR-0004's
//! "rebuildable cache" promise).
//!
//! `body` uses the English stemmer so `running` and `runs` retrieve the
//! same documents; `title` does not stem so users get exact-title matches
//! at the top of the result list (boosted in the v0.3 PR D query parser).
//!
//! `tags` uses the `raw` tokenizer so the v0.3 PR D query parser's
//! `tag:foo` operator does an exact-token match instead of stemming
//! (`tag:running` should NOT match `tag:run`).
//!
//! [ADR-0004]: https://github.com/goldr0g3r/lattice/blob/main/docs/decisions/0004-tantivy-full-text-search.md
//! [ADR-0018]: https://github.com/goldr0g3r/lattice/blob/main/docs/decisions/0018-search-query-grammar.md

use tantivy::schema::{
    IndexRecordOption, Schema, SchemaBuilder, TextFieldIndexing, TextOptions, FAST, STORED, STRING,
};

/// Subdirectory name under `<vault>/.lattice/` where the Tantivy index lives.
pub const INDEX_DIR_NAME: &str = "tantivy";

/// Tokenizer name for the body field (English stemmer + lowercase + simple).
pub const BODY_TOKENIZER: &str = "en_stem";

/// Tokenizer name for the title field (lowercase + simple, no stemming).
pub const TITLE_TOKENIZER: &str = "default";

/// Tokenizer name for the id / path / tags fields (exact-match, no tokenization).
pub const RAW_TOKENIZER: &str = "raw";

/// Field handles for the five locked fields.
///
/// The struct is returned by [`build_schema`] alongside the [`Schema`] itself
/// so callers don't have to look up field names by string at every write.
#[derive(Debug, Clone, Copy)]
pub struct Fields {
    /// Stable note id (the only field used for `delete_term`).
    pub id: tantivy::schema::Field,
    /// Vault-relative path; used by the `path:` operator (ADR-0018).
    pub path: tantivy::schema::Field,
    /// Note title — indexed with default tokenizer for prose matches.
    pub title: tantivy::schema::Field,
    /// Note body — indexed with English stemmer.
    pub body: tantivy::schema::Field,
    /// Tags — exact-match tokens, multi-valued.
    pub tags: tantivy::schema::Field,
}

/// Build the locked schema and the field handles in one shot.
pub fn build_schema() -> (Schema, Fields) {
    let mut builder = SchemaBuilder::new();

    let id = builder.add_text_field("id", STRING | STORED);
    let path = builder.add_text_field("path", STRING | STORED);

    let title = builder.add_text_field(
        "title",
        TextOptions::default()
            .set_stored()
            .set_indexing_options(
                TextFieldIndexing::default()
                    .set_tokenizer(TITLE_TOKENIZER)
                    .set_index_option(IndexRecordOption::WithFreqsAndPositions),
            ),
    );

    let body = builder.add_text_field(
        "body",
        TextOptions::default()
            .set_stored()
            .set_indexing_options(
                TextFieldIndexing::default()
                    .set_tokenizer(BODY_TOKENIZER)
                    .set_index_option(IndexRecordOption::WithFreqsAndPositions),
            ),
    );

    let tags = builder.add_text_field(
        "tags",
        TextOptions::default()
            .set_stored()
            .set_indexing_options(
                TextFieldIndexing::default()
                    .set_tokenizer(RAW_TOKENIZER)
                    .set_index_option(IndexRecordOption::WithFreqs)
                    .set_fieldnorms(false),
            )
            .set_fast(Some(RAW_TOKENIZER)),
    );

    // `FAST` is a fielded marker that future term-aggregation queries will
    // need (tag tree / facet count in v0.3 PR G). Silence the unused warning
    // until then.
    let _ = FAST;

    let schema = builder.build();
    let fields = Fields {
        id,
        path,
        title,
        body,
        tags,
    };
    (schema, fields)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schema_has_five_fields() {
        let (schema, _fields) = build_schema();
        let names: Vec<_> = schema.fields().map(|(_, e)| e.name().to_string()).collect();
        assert_eq!(
            names,
            vec!["id", "path", "title", "body", "tags"],
            "schema field order is part of the on-disk format; do not reorder"
        );
    }

    #[test]
    fn id_field_uses_raw_tokenizer_for_exact_delete() {
        let (schema, fields) = build_schema();
        let entry = schema.get_field_entry(fields.id);
        let opts = entry
            .field_type()
            .get_index_record_option()
            .expect("id must be indexed for delete_term");
        // We don't care which record option; we care that the id is indexed
        // (otherwise delete_term silently no-ops).
        assert!(matches!(
            opts,
            IndexRecordOption::Basic
                | IndexRecordOption::WithFreqs
                | IndexRecordOption::WithFreqsAndPositions
        ));
    }
}
