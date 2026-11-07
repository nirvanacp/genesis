// The WHATWG URL global exists in Node and in every WebView. This package has no DOM lib,
// so it declares only the members it uses.
declare class URLSearchParams {
  has(name: string): boolean;
  get(name: string): string | null;
}
declare class URL {
  constructor(url: string, base?: string);
  href: string;
  readonly origin: string;
  protocol: string;
  username: string;
  password: string;
  pathname: string;
  hash: string;
  readonly searchParams: URLSearchParams;
}
