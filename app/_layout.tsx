import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function RootLayout() {
  const [isLogin, setIsLogin] = useState<boolean | null>(null);

  useEffect(() => {
    const checkLogin = async () => {
      const user = await AsyncStorage.getItem('@current_user');
      setIsLogin(!!user);
    };
    checkLogin();
  }, []);

  if (isLogin === null) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      {!isLogin ? (
        <Stack.Screen name="(auth)/login" />
      ) : (
        <Stack.Screen name="(tabs)" />
      )}
    </Stack>
  );
}