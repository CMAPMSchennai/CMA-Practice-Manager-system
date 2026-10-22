/**
 * File naming for engagement documents (Gap #83): <engagement code>_<document type>.<ext>
 * so a reviewer can tell which engagement a file belongs to from its name alone.
 */

function slugType(documentType: string): string {
  return documentType
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function splitExtension(fileName: string): { base: string; ext: string } {
  const i = fileName.lastIndexOf(".");
  if (i <= 0) return { base: fileName, ext: "" };
  return { base: fileName.slice(0, i), ext: fileName.slice(i) };
}

/** The name the doer must give the file, without the extension. */
export function requiredBaseName(engagementCode: string, documentType: string): string {
  return `${engagementCode}_${slugType(documentType)}`;
}

/** The full name to show the doer, using the extension of the file they picked (if any). */
export function suggestedFileName(
  engagementCode: string,
  documentType: string,
  pickedFileName?: string,
): string {
  const ext = pickedFileName ? splitExtension(pickedFileName).ext : "";
  return `${requiredBaseName(engagementCode, documentType)}${ext || ".pdf"}`;
}

/**
 * True when the file name (extension ignored, case ignored) is the required name,
 * or the required name with a number from 2 up (_2, _3) for another file of the
 * same type on the same engagement.
 */
export function matchesRequiredName(
  fileName: string,
  engagementCode: string,
  documentType: string,
): boolean {
  const { base } = splitExtension(fileName.trim());
  const want = requiredBaseName(engagementCode, documentType).toLowerCase();
  const got = base.toLowerCase();
  if (got === want) return true;
  if (!got.startsWith(`${want}_`)) return false;
  const n = got.slice(want.length + 1);
  return /^[2-9]$|^[1-9][0-9]+$/.test(n);
}

/** Name without extension, lower case, for comparing file names. */
export function nameKey(fileName: string): string {
  return splitExtension(fileName.trim()).base.toLowerCase();
}

/**
 * The name for "add as another file": the required name with _2, _3 and so on,
 * the first one not already used on the engagement.
 */
export function anotherFileName(
  engagementCode: string,
  documentType: string,
  pickedFileName: string | undefined,
  existingNames: string[],
): string {
  const ext = pickedFileName ? splitExtension(pickedFileName).ext : "";
  const base = requiredBaseName(engagementCode, documentType);
  const used = new Set(existingNames.map(nameKey));
  let n = 2;
  while (used.has(`${base}_${n}`.toLowerCase())) n++;
  return `${base}_${n}${ext || ".pdf"}`;
}
