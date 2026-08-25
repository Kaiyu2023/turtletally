/// <reference types="vite/client" />

interface ImportMetaEnv {
  /// Where the deployed API lives, relative to this page's origin. Absent in a
  /// draft build, which then runs against the in-memory mock instead.
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
