export const withUpstreamCookie = <T extends Response>(
  response: T,
  setCookie?: string | null,
): T => {
  if (setCookie) {
    response.headers.set("set-cookie", setCookie);
  }

  return response;
};
