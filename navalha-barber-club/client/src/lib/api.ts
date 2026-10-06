export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const data = response.status === 204 ? {} : await response.json();
  if (!response.ok)
    throw new ApiError(
      data.message || "Não foi possível concluir. Tente novamente.",
      response.status,
    );
  return data as T;
}
export const send = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
