import { Alert, AlertButton, Platform } from 'react-native';

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const fullText = [title, message].filter(Boolean).join('\n\n');

    if (buttons && buttons.length >= 2) {
      const cancelBtn = buttons.find((b) => b.style === 'cancel') ?? buttons[0];
      const actionBtn = buttons.find((b) => b !== cancelBtn) ?? buttons[buttons.length - 1];
      const confirmed = window.confirm(fullText);
      if (confirmed) {
        actionBtn?.onPress?.();
      } else {
        cancelBtn?.onPress?.();
      }
      return;
    }

    window.alert(fullText);
    buttons?.[0]?.onPress?.();
  };
}
