// Shared by all URL instances and tabs; one cookie per host, as in the book.
export interface Cookie {
  value: string;
  params: Map<string, string>;
}

export const COOKIE_JAR = new Map<string, Cookie>();

export function parseCookie(header: string): Cookie {
  const [value = "", ...attributes] = header.split(";");
  const params = new Map<string, string>();
  for (const attribute of attributes) {
    const equals = attribute.indexOf("=");
    const name = (equals === -1 ? attribute : attribute.slice(0, equals)).trim().toLowerCase();
    const value =
      equals === -1
        ? "true"
        : attribute
            .slice(equals + 1)
            .trim()
            .toLowerCase();
    if (name) {
      params.set(name, value);
    }
  }
  return { value: value.trim(), params };
}
