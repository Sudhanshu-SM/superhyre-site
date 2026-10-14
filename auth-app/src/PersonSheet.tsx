import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { getCandidate } from "./api/candidates";
import type { PipelinePerson } from "./campaign";
import { candidateFromCardPerson, candidateFromDetail } from "./liveCandidate";
import { ProfileSidebar } from "./ProfileSidebar";

/**
 * A person on a campaign's board, opened in the console's own profile sheet: the one the chat opens a
 * candidate in (fit, career, experience, education, skills, status, contact details, notes), so a person
 * is read the same way wherever they were met. `extra` sits under the header: a campaign page puts the
 * person's stage there, because moving them is what the page is for.
 *
 * What the board already knows shows at once; the full profile replaces it when it arrives.
 */
export function PersonSheet({ person, onClose, extra }: { person: PipelinePerson; onClose: () => void; extra?: ReactNode }): JSX.Element {
  const id = person.candidateId ?? null;
  const [detail, setDetail] = useState<{ id: string; value: Parameters<typeof candidateFromDetail>[0] } | null>(null);
  useEffect(() => {
    if (!id) return;
    let gone = false;
    getCandidate(id).then((d) => { if (!gone) setDetail({ id, value: d }); }, () => { /* the board's own facts stay */ });
    return () => { gone = true; };
  }, [id]);
  const candidate = useMemo(() => {
    if (!id) return null;
    if (detail?.id === id) return candidateFromDetail(detail.value);
    return candidateFromCardPerson({
      personId: null,
      candidateId: id,
      name: person.name,
      title: person.title || null,
      company: person.company || null,
      city: person.location || null,
      years: person.years || null,
      strengths: [],
      linkedinUrl: null,
    });
  }, [id, detail, person.name, person.title, person.company, person.location, person.years]);
  return (
    <ProfileSidebar
      candidate={candidate}
      onClose={onClose}
      onVerdict={() => {}}
      canDecide={false}
      extra={extra}
    />
  );
}
