module.exports = {
  maybeCompleteAuthSession: () => ({ type: 'failed', message: 'No active web auth session' }),
  openAuthSessionAsync: async (url) => {
    if (typeof window !== 'undefined' && window.location) {
      window.location.href = url;
    }
    return { type: 'cancel' };
  },
  warmUpAsync: async () => ({}),
  coolDownAsync: async () => ({}),
};
