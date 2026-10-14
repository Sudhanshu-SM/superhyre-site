/// <reference types="vite/client" />

/* Declared so `import.meta.env.VITE_SUPABASE_URL` is `string | undefined`
   rather than `any` — the no-implicit-any rule applies to env access too. */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  /** The SuperHyre API. Unset: the console runs on its fixtures, as a prototype. */
  readonly VITE_API_URL?: string;
  /** Development only: a token for the local API when sign-in is skipped. */
  readonly VITE_DEV_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
