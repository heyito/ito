export async function getAuth0ManagementToken(): Promise<string | null> {
  const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN
  const AUTH0_MGMT_CLIENT_ID = process.env.AUTH0_MGMT_CLIENT_ID
  const AUTH0_MGMT_CLIENT_SECRET = process.env.AUTH0_MGMT_CLIENT_SECRET

  if (!AUTH0_DOMAIN || !AUTH0_MGMT_CLIENT_ID || !AUTH0_MGMT_CLIENT_SECRET) {
    return null
  }

  try {
    const tokenUrl = `https://${AUTH0_DOMAIN}/oauth/token`
    const res = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: AUTH0_MGMT_CLIENT_ID,
        client_secret: AUTH0_MGMT_CLIENT_SECRET,
        audience: `https://${AUTH0_DOMAIN}/api/v2/`,
      }),
    })
    const data: any = await res.json()
    if (!res.ok || !data?.access_token) {
      return null
    }
    return data.access_token as string
  } catch {
    return null
  }
}

export async function getUserInfoFromAuth0(
  userSub: string,
): Promise<{ email?: string; name?: string } | null> {
  const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN
  if (!AUTH0_DOMAIN) return null

  const token = await getAuth0ManagementToken()
  if (!token) return null

  try {
    const encodedSub = encodeURIComponent(userSub)
    const url = `https://${AUTH0_DOMAIN}/api/v2/users/${encodedSub}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) return null

    const user = await res.json()
    return {
      email: user.email as string | undefined,
      name: user.name as string | undefined,
    }
  } catch {
    return null
  }
}
