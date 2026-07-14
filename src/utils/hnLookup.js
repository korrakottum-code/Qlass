const ALLOWED_HN_FUNCTIONS = new Set(["search-hn", "search-hn-recovery"]);

export function selectHnLookupFunction(requestedFunction) {
  return ALLOWED_HN_FUNCTIONS.has(requestedFunction) ? requestedFunction : "search-hn";
}

export async function lookupHnCustomers({ query, requestedFunction, token, invoke }) {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim();
  try {
    const { data, error } = await invoke(selectHnLookupFunction(requestedFunction), {
      body: { q },
      headers: { "X-Qlass-Session": token || "" },
    });
    if (error || !data?.data) return [];
    return data.data.map((customer) => ({
      hnId: customer.hnId,
      firstname: customer.firstname || "",
      lastname: customer.lastname || "",
      nickname: customer.nickname || "",
      telephone: customer.telephone || "",
      birthdate: customer.birthdate || "",
      source: data.source || "proclinic",
      cookiesExpired: data.cookiesExpired || false,
    }));
  } catch {
    return [];
  }
}
