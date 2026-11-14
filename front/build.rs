//! Embeds the Zola build (`../public`, or `WEBSITE_PUBLIC_DIR`) into the
//! front, and reads which language counters the app deploys from
//! `../wasmkeep.toml`. Writes `$OUT_DIR/site.rs`:
//!
//! - `ASSETS`: every file, sorted by path, with its content type, its
//!   ETag and the fingerprint Zola's `cachebust` gives it;
//! - `DEPLOYED`: the `[classes.<name>]` of the project file.

use sha2::{Digest, Sha256};
use std::fmt::Write as _;
use std::path::{Path, PathBuf};
use std::{env, fs};

fn main() {
    let manifest = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let public =
        env::var_os("WEBSITE_PUBLIC_DIR").map_or_else(|| manifest.join("../public"), PathBuf::from);
    let project = manifest.join("../wasmkeep.toml");
    println!("cargo:rerun-if-env-changed=WEBSITE_PUBLIC_DIR");
    println!("cargo:rerun-if-changed={}", public.display());
    println!("cargo:rerun-if-changed={}", project.display());

    assert!(
        public.join("index.html").is_file(),
        "{} has no index.html: build the site first (scripts/build-site.sh)",
        public.display()
    );
    let mut files = Vec::new();
    walk(&public, &mut files);
    let mut assets: Vec<(String, PathBuf)> = files
        .into_iter()
        .map(|file| {
            let rel = file.strip_prefix(&public).unwrap();
            let path = rel
                .components()
                .map(|c| c.as_os_str().to_str().expect("UTF-8 file names"))
                .collect::<Vec<_>>()
                .join("/");
            (format!("/{path}"), file)
        })
        .collect();
    assets.sort();

    let mut out = String::from("pub static ASSETS: &[Asset] = &[\n");
    for (path, file) in &assets {
        let body = fs::read(file).unwrap();
        let digest = Sha256::digest(&body);
        let hex: String = digest.iter().fold(String::new(), |mut s, b| {
            let _ = write!(s, "{b:02x}");
            s
        });
        writeln!(
            out,
            "    Asset {{ path: {path:?}, content_type: {:?}, etag: {:?}, fingerprint: {:?}, body: include_bytes!({:?}) }},",
            content_type(path),
            format!("\"{}\"", &hex[..32]),
            &hex[..20],
            file.canonicalize().unwrap().display().to_string(),
        )
        .unwrap();
    }
    out.push_str("];\n\n");

    let toml = fs::read_to_string(&project).unwrap_or_default();
    let deployed: Vec<&str> = toml
        .lines()
        .filter_map(|line| {
            line.trim()
                .strip_prefix("[classes.")?
                .strip_suffix(']')
                .map(str::trim)
        })
        .collect();
    writeln!(out, "pub static DEPLOYED: &[&str] = &{deployed:?};").unwrap();

    fs::write(
        PathBuf::from(env::var("OUT_DIR").unwrap()).join("site.rs"),
        out,
    )
    .unwrap();
}

fn walk(dir: &Path, files: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(dir).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            walk(&path, files);
        } else {
            files.push(path);
        }
    }
}

fn content_type(path: &str) -> &'static str {
    match path.rsplit_once('.').map(|(_, ext)| ext) {
        Some("html") => "text/html; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("js") => "text/javascript; charset=utf-8",
        Some("json") => "application/json",
        Some("svg") => "image/svg+xml",
        Some("xml") => "application/xml",
        Some("txt") => "text/plain; charset=utf-8",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("avif") => "image/avif",
        Some("ico") => "image/x-icon",
        Some("woff2") => "font/woff2",
        Some("wasm") => "application/wasm",
        _ => "application/octet-stream",
    }
}
