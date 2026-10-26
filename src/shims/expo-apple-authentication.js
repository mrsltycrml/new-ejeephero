module.exports = {
  isAvailableAsync: async () => false,
  signInAsync: async () => {
    throw new Error('Apple Authentication is not configured');
  },
  AppleAuthenticationScope: {
    FULL_NAME: 0,
    EMAIL: 1,
  },
};
