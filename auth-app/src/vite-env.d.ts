/// <reference types="vite/client" />

/* Declared so `import.meta.env.VITE_SUPABASE_URL` is `string | undefined`
   rather than `any` — the no-implicit-any rule applies to env access too. */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
