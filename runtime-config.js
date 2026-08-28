/* Public runtime configuration for the static trial build.
   No provider credential, no Supabase key and no backend endpoint is published
   here: the trial runs entirely against the local reviewable MOCK. */
window.IRIS_RUNTIME_CONFIG = Object.freeze({
  "mode": "local-mock",
  "supabaseUrl": "",
  "supabasePublishableKey": "",
  "githubPagesBasePath": "/iris-commercial-studio-pages/",
  "allowedOrigins": [
    "https://nightwhisper713-dotcom.github.io"
  ]
});
