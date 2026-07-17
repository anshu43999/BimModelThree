// Public manifest helpers exposed through the SDK package.
// The implementation lives one level up so the standalone viewer and SDK use
// exactly the same manifest normalization rules.
export {
    MANIFEST_SCHEMA_VERSION,
    loadModelManifest,
    normalizeManifest
} from "../manifest-loader.js";
