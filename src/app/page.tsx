import { Editor } from "@/components/Editor";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">MediaMaja</h1>
        <p className="mt-1 text-sm text-muted">
          Drop in a picture and describe the change you want. Everything happens in this
          browser — your photo is never uploaded anywhere.
        </p>
      </header>

      <Editor />
    </main>
  );
}
