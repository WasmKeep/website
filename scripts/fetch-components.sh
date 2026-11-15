#!/usr/bin/env bash
# Downloads the example components the language wall runs, for the
# WasmKeep version in WASMKEEP_VERSION, from the GitHub release, and checks
# them before placing them in components/:
#
#   1. the Sigstore bundle of SHA256SUMS, then SHA256SUMS itself;
#   2. the Sigstore bundle of each component.
#
# The bundles are checked with cosign 3, as the WasmKeep docs do
# (https://docs.wasmkeep.dev/deploy/single-node.html). Without cosign the
# checksums are still checked, with a warning; REQUIRE_COSIGN=1 makes a
# missing cosign an error (CI sets it).
#
#   scripts/fetch-components.sh          # components into components/
#   scripts/fetch-components.sh --cli    # also the CLI, into .cache/bin/
#
# Environment:
#   COSIGN          the cosign command (default: `cosign` on PATH)
#   COSIGN_IMAGE    run cosign from this container image with podman
#                   instead, e.g. ghcr.io/sigstore/cosign/cosign:v3.1.4
#   REQUIRE_COSIGN  1: fail when no cosign is available
#
# Nothing downloaded here is committed: components/ and .cache/ are in
# .gitignore.
set -euo pipefail

root=$(cd "$(dirname "$0")/.." && pwd)
version=$(tr -d '[:space:]' <"$root/WASMKEEP_VERSION")
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || {
  echo "WASMKEEP_VERSION: not a version: $version" >&2
  exit 1
}
repo=WasmKeep/wasmkeep
tag="v$version"
base="https://github.com/$repo/releases/download/$tag"
identity="https://github.com/$repo/.github/workflows/release.yml@refs/tags/$tag"
issuer="https://token.actions.githubusercontent.com"

# Each language's counter: the class it becomes and the release asset it
# comes from. A language whose counter is not a release asset yet is
# listed in `missing` and left off the wall until a release carries it.
declare -A asset_of=(
  [rust]=counter.wasm
  [typescript]=counter-typescript.wasm
  [python]=counter-python.wasm
  [go]=counter-go.wasm
  [c]=counter-c.wasm
  [zig]=counter-zig.wasm
)
missing=(d moonbit csharp)

with_cli=0
for arg in "$@"; do
  case $arg in
    --cli) with_cli=1 ;;
    -h | --help)
      sed -n '2,25p' "$0"
      exit 0
      ;;
    *)
      echo "unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

cache="$root/.cache/$version"
mkdir -p "$cache" "$root/components"
cd "$cache"

fetch() {
  local name=$1
  if [[ ! -s $name ]]; then
    echo "downloading $name"
    curl -fsSL --retry 3 -o "$name.part" "$base/$name"
    mv "$name.part" "$name"
  fi
}

# cosign, if there is one: a command line, as an array.
cosign=()
if [[ -n ${COSIGN_IMAGE:-} ]]; then
  cosign=(podman run --rm -v "$cache:/work:Z" -w /work "$COSIGN_IMAGE")
elif [[ -n ${COSIGN:-} ]]; then
  read -r -a cosign <<<"$COSIGN"
elif command -v cosign >/dev/null; then
  cosign=(cosign)
fi
if ((${#cosign[@]} == 0)); then
  if [[ ${REQUIRE_COSIGN:-0} == 1 ]]; then
    echo "error: cosign is required (REQUIRE_COSIGN=1) and none was found" >&2
    exit 1
  fi
  cat >&2 <<'EOF'
WARNING: cosign not found. Only the SHA256SUMS checksums are checked, and
SHA256SUMS itself is NOT verified: a tampered release would pass. Install
cosign 3, or set COSIGN_IMAGE=ghcr.io/sigstore/cosign/cosign:v3.1.4 to run
it with podman.
EOF
fi

verify_bundle() {
  local name=$1
  fetch "$name.sigstore.json"
  if ((${#cosign[@]})); then
    "${cosign[@]}" verify-blob --bundle "$name.sigstore.json" \
      --certificate-identity "$identity" \
      --certificate-oidc-issuer "$issuer" "$name" >/dev/null 2>&1 || {
      echo "error: the Sigstore bundle of $name does not verify" >&2
      exit 1
    }
    echo "verified $name (Sigstore, $identity)"
  fi
}

check_sum() {
  local name=$1 line
  line=$(awk -v n="$name" '$2 == n || $2 == "*" n' SHA256SUMS)
  [[ -n $line ]] || {
    echo "error: $name is not in SHA256SUMS" >&2
    exit 1
  }
  printf '%s\n' "$line" | sha256sum -c --quiet - || {
    echo "error: $name does not match SHA256SUMS" >&2
    exit 1
  }
  echo "checked $name (SHA256SUMS)"
}

fetch SHA256SUMS
verify_bundle SHA256SUMS

for lang in "${!asset_of[@]}"; do
  name=${asset_of[$lang]}
  fetch "$name"
  verify_bundle "$name"
  check_sum "$name"
  install -m 644 "$name" "$root/components/$lang-counter.wasm"
  echo "components/$lang-counter.wasm <- $name ($tag)"
done

notices=THIRD_PARTY_NOTICES-components.txt
fetch "$notices"
verify_bundle "$notices"
check_sum "$notices"
install -m 644 "$notices" "$root/components/$notices"

if ((with_cli)); then
  case $(uname -m) in
    x86_64) triple=x86_64-unknown-linux-gnu ;;
    aarch64 | arm64) triple=aarch64-unknown-linux-gnu ;;
    *)
      echo "error: no release binary for $(uname -m)" >&2
      exit 1
      ;;
  esac
  tarball="wasmkeep-$version-$triple.tar.gz"
  fetch "$tarball"
  verify_bundle "$tarball"
  check_sum "$tarball"
  rm -rf "cli" && mkdir cli && tar xzf "$tarball" -C cli
  mkdir -p "$root/.cache/bin"
  install -m 755 "cli/wasmkeep-$version-$triple/wasmkeep" "$root/.cache/bin/wasmkeep"
  echo ".cache/bin/wasmkeep <- $tarball"
fi

if ((${#missing[@]})); then
  echo "not in the $tag release yet, so not on the wall: ${missing[*]}"
fi
