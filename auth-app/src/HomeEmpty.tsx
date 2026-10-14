import type { ReactNode } from "react";
import { EmptyArt } from "./EmptyArt";
import type { EmptyArtName } from "./EmptyArt";

/** The picture's width on a tall card, and on a short one (the bottom row, where the block sits picture beside words). */
export const HOME_EMPTY_ART = 120;
export const HOME_EMPTY_ART_SHORT = 72;

/**
 * What an empty card on Home says, in one shape for every card: a spot picture (120 px), a short headline, one
 * calm line and one action (a primary button, or a quiet link when there is nothing to start), centred both
 * ways in the card's free space so the card keeps its height and nothing sits in a corner.
 *
 * Never sad and never an error: an empty card is a place to begin. The block has no frame and no edge bar; it
 * is the card's own surface, light or dark.
 */
export function HomeEmpty({ art, title, line, short = false, children }: {
  art: EmptyArtName;
  title: string;
  line?: string;
  /** A short card (the bottom row): a smaller picture beside the words, the same block centred the same way. */
  short?: boolean;
  /** The action or two: a primary button first, a quiet link after it. */
  children?: ReactNode;
}) {
  return (
    <div className={`hm-es${short ? " is-short" : ""}`}>
      <EmptyArt name={art} size={short ? HOME_EMPTY_ART_SHORT : HOME_EMPTY_ART} />
      <div className="hm-es-w">
        <h3 className="hm-es-t">{title}</h3>
        {line && <p className="hm-es-l">{line}</p>}
        {children && <div className="hm-es-a">{children}</div>}
      </div>
    </div>
  );
}
