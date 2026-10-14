import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import { LOGO_ACCEPT, squareLogo } from "../../logoImage";
import { OrgMark } from "../../OrgMark";
import { setupLogo } from "./logoDraft";
import { TextAction } from "./Voice";

/**
 * Under the organisation's name: "Add your logo", never required. A picture is cropped and shrunk in the
 * browser and held until the set-up finishes. No frame: a quiet line, like the other small actions here.
 */
export function LogoAsk({ delay, reduce }: { delay: number; reduce: boolean }): JSX.Element {
  const [logo, setLogo] = useState<string | null>(setupLogo.get());
  const [problem, setProblem] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const take = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    try {
      const url = await squareLogo(file);
      setupLogo.set(url);
      setLogo(url);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That image didn't work. Try another.");
    } finally {
      if (input.current) input.current.value = "";
    }
  };

  const choose = () => input.current?.click();
  return (
    <div className={`nx-logo${reduce ? " is-still" : ""}`} style={{ "--delay": `${delay}ms` } as CSSProperties}>
      {logo ? (
        <>
          <OrgMark name="" logoUrl={logo} size={28} />
          <span className="nx-logo-t">Your logo</span>
          <TextAction onClick={choose}>Change</TextAction>
          <TextAction onClick={() => { setupLogo.set(null); setLogo(null); }}>Remove</TextAction>
        </>
      ) : (
        <>
          <TextAction onClick={choose}>Add your logo</TextAction>
          <span className="nx-logo-t">Optional. You can add it later in Settings.</span>
        </>
      )}
      {problem && <span className="nx-problem" role="alert">{problem}</span>}
      <input ref={input} type="file" accept={LOGO_ACCEPT} className="nx-sr" tabIndex={-1} aria-label="Organisation logo" onChange={(e) => void take(e.target.files?.[0])} />
    </div>
  );
}
