/**
 * What a spreadsheet of roles needs, in the fewest words: the permission to read it, how its rows are laid out, and
 * which columns it takes. One list for every place that asks for a sheet (the New campaign dialog, the Job description
 * dialog), so the rule is said the same way everywhere. It matches what the server reads (`jd-sheet.ts`).
 */
export function SheetNeeds({ file }: { /** An Excel or CSV file has no sharing to set. */ file?: boolean }): JSX.Element {
  return (
    <dl className="ji-needs">
      {!file && (
        <>
          <dt>Permission</dt>
          <dd>Share → General access → <b>Anyone with the link</b> (Viewer)</dd>
        </>
      )}
      <dt>Rows</dt>
      <dd>One role per row, headings in row 1</dd>
      <dt>Required</dt>
      <dd><b>Job description</b> column (or “JD”)</dd>
      <dt>Optional</dt>
      <dd>Role, Client, Location, Experience, CTC, Openings, Notice</dd>
      <dt>Limit</dt>
      <dd>50 roles</dd>
    </dl>
  );
}
