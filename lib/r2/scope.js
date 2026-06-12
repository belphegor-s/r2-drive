export const SCOPES = {
  public: {
    bucket: process.env.R2_BUCKET_NAME,
    rootPrefix: 'uploads',
    acl: 'public-read',
    publicBase: process.env.R2_PUBLIC_BASE_URL || 'https://storage.procd.cc',
  },
  private: {
    bucket: process.env.R2_PRIVATE_BUCKET_NAME,
    rootPrefix: 'private',
    acl: undefined,
    publicBase: null,
  },
};

export function resolveScope(scope) {
  const cfg = SCOPES[scope];
  if (!cfg) {
    const err = new Error(`Invalid scope: ${scope}`);
    err.statusCode = 400;
    throw err;
  }
  return cfg;
}

export function isValidScope(scope) {
  return Boolean(SCOPES[scope]);
}
