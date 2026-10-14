/**
 * The logo added while the organisation is being set up. It is kept here and not in the answers: the answers
 * are saved to the server as the person goes and a picture does not belong in them. It goes to the server with
 * the finish, together with the organisation it is for, and is forgotten once the set-up leaves.
 */
let picked: string | null = null;

export const setupLogo = {
  get: (): string | null => picked,
  set: (dataUrl: string | null): void => {
    picked = dataUrl;
  },
};
