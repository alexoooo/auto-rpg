"""Download the pinned perceptual models and record their tensor hashes."""

import json

from score import MODEL_MANIFEST_PATH, NeuralMetrics, model_manifest


def main() -> None:
    neural = NeuralMetrics(verify=False)
    manifest = model_manifest(neural)
    if MODEL_MANIFEST_PATH.exists():
        expected = json.loads(MODEL_MANIFEST_PATH.read_text(encoding="utf-8"))
        if expected != manifest:
            raise RuntimeError("downloaded model tensors differ from the committed model manifest")
    else:
        MODEL_MANIFEST_PATH.write_text(
            json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8",
        )
        print(f"created {MODEL_MANIFEST_PATH}")
    print("perceptual model tensors match the manifest")


if __name__ == "__main__":
    main()
