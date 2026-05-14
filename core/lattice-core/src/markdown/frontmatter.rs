//! YAML frontmatter extraction.
//!
//! Detects a leading `---\n…\n---\n` block and parses it into a
//! [`Frontmatter`] preserving key order (D3). Returns the body slice
//! immediately after the closing fence; callers feed that to the Markdown
//! parser proper.

use serde_yaml_ng::Value as YamlValue;

use crate::error::{LatticeError, LatticeResult};
use crate::markdown::doc::{Frontmatter, FrontmatterEntry};

/// Extract YAML frontmatter from `input`.
///
/// Returns `(Frontmatter::default(), input)` when no frontmatter block is
/// present, otherwise returns the parsed map and a `&str` slice into `input`
/// just after the closing `---\n`.
pub fn extract(input: &str) -> LatticeResult<(Frontmatter, &str)> {
    // Frontmatter must start at byte 0 with `---` followed by a newline.
    let stripped = match input.strip_prefix("---\n") {
        Some(rest) => rest,
        None => match input.strip_prefix("---\r\n") {
            Some(rest) => rest,
            None => return Ok((Frontmatter::default(), input)),
        },
    };

    // Find the closing `---` on its own line.
    let close_marker = "\n---\n";
    let crlf_close = "\n---\r\n";
    let (yaml_text, after_close) = if let Some(rest) = stripped.strip_prefix("---\n") {
        // Empty body: closing fence immediately follows opening fence.
        ("", rest)
    } else if let Some(rest) = stripped.strip_prefix("---\r\n") {
        ("", rest)
    } else if stripped == "---" {
        ("", "")
    } else if let Some(idx) = stripped.find(close_marker) {
        (&stripped[..idx], &stripped[idx + close_marker.len()..])
    } else if let Some(idx) = stripped.find(crlf_close) {
        (&stripped[..idx], &stripped[idx + crlf_close.len()..])
    } else if stripped.ends_with("\n---") {
        // Closing fence is the last line of the file, no trailing newline.
        let idx = stripped.len() - "\n---".len();
        (&stripped[..idx], "")
    } else {
        return Err(LatticeError::InvalidPath {
            path: "<input>".into(),
            reason: "frontmatter started with `---` but never closed".into(),
        });
    };

    let frontmatter = if yaml_text.trim().is_empty() {
        Frontmatter::default()
    } else {
        parse_yaml(yaml_text)?
    };

    Ok((frontmatter, after_close))
}

fn parse_yaml(yaml: &str) -> LatticeResult<Frontmatter> {
    let parsed: YamlValue =
        serde_yaml_ng::from_str(yaml).map_err(|err| LatticeError::InvalidPath {
            path: "<frontmatter>".into(),
            reason: format!("yaml parse: {err}"),
        })?;

    let mapping = match parsed {
        YamlValue::Mapping(m) => m,
        // An empty document is fine; anything else at the top level is rejected.
        YamlValue::Null => return Ok(Frontmatter::default()),
        other => {
            return Err(LatticeError::InvalidPath {
                path: "<frontmatter>".into(),
                reason: format!("frontmatter must be a YAML mapping, got {other:?}"),
            });
        }
    };

    let mut entries = Vec::with_capacity(mapping.len());
    for (k, v) in mapping {
        let key = match k {
            YamlValue::String(s) => s,
            other => {
                return Err(LatticeError::InvalidPath {
                    path: "<frontmatter>".into(),
                    reason: format!("frontmatter keys must be strings, got {other:?}"),
                });
            }
        };
        let value = yaml_to_json(v).map_err(|err| LatticeError::InvalidPath {
            path: format!("<frontmatter>:{key}"),
            reason: err,
        })?;
        entries.push(FrontmatterEntry { key, value });
    }

    Ok(Frontmatter { entries })
}

fn yaml_to_json(value: YamlValue) -> Result<serde_json::Value, String> {
    Ok(match value {
        YamlValue::Null => serde_json::Value::Null,
        YamlValue::Bool(b) => serde_json::Value::Bool(b),
        YamlValue::Number(n) => {
            // serde_yaml_ng's Number doesn't expose i64/u64/f64 directly without
            // going through serde — round-trip via JSON for fidelity.
            let s = n.to_string();
            if let Ok(i) = s.parse::<i64>() {
                serde_json::Value::Number(i.into())
            } else if let Ok(u) = s.parse::<u64>() {
                serde_json::Value::Number(u.into())
            } else if let Ok(f) = s.parse::<f64>() {
                serde_json::Number::from_f64(f)
                    .map(serde_json::Value::Number)
                    .unwrap_or(serde_json::Value::Null)
            } else {
                serde_json::Value::String(s)
            }
        }
        YamlValue::String(s) => serde_json::Value::String(s),
        YamlValue::Sequence(seq) => {
            let mut out = Vec::with_capacity(seq.len());
            for v in seq {
                out.push(yaml_to_json(v)?);
            }
            serde_json::Value::Array(out)
        }
        YamlValue::Mapping(map) => {
            let mut out = serde_json::Map::with_capacity(map.len());
            for (k, v) in map {
                let key = match k {
                    YamlValue::String(s) => s,
                    other => return Err(format!("non-string map key: {other:?}")),
                };
                out.insert(key, yaml_to_json(v)?);
            }
            serde_json::Value::Object(out)
        }
        YamlValue::Tagged(tagged) => yaml_to_json(tagged.value)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_frontmatter_returns_original_input() {
        let (fm, body) = extract("# hello\n").unwrap();
        assert!(fm.is_empty());
        assert_eq!(body, "# hello\n");
    }

    #[test]
    fn empty_frontmatter_block() {
        let (fm, body) = extract("---\n---\n# hello\n").unwrap();
        assert!(fm.is_empty());
        assert_eq!(body, "# hello\n");
    }

    #[test]
    fn simple_frontmatter() {
        let input = "---\ntitle: Hello\ntags: [a, b]\n---\nbody\n";
        let (fm, body) = extract(input).unwrap();
        assert_eq!(fm.entries.len(), 2);
        assert_eq!(fm.entries[0].key, "title");
        assert_eq!(fm.entries[0].value, serde_json::json!("Hello"));
        assert_eq!(fm.entries[1].key, "tags");
        assert_eq!(fm.entries[1].value, serde_json::json!(["a", "b"]));
        assert_eq!(body, "body\n");
    }

    #[test]
    fn preserves_key_order() {
        let input = "---\nz: 1\na: 2\nm: 3\n---\n";
        let (fm, _) = extract(input).unwrap();
        let keys: Vec<_> = fm.entries.iter().map(|e| e.key.as_str()).collect();
        assert_eq!(keys, vec!["z", "a", "m"]);
    }

    #[test]
    fn unclosed_frontmatter_errors() {
        let err = extract("---\ntitle: x\n").unwrap_err();
        assert!(matches!(err, LatticeError::InvalidPath { .. }));
    }
}
