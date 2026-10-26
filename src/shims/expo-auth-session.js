module.exports = {
  makeRedirectUri: (options = {}) => {
    const path = options.path || 'oauth-native-callback';
    if (typeof window !== 'undefined' && window.location) {
      return `${window.location.origin}/${path}`;
    }
    return `ejeephero://${path}`;
  },
};
