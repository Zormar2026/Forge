import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import StudioScreen from './screens/StudioScreen';
import CalendarScreen from './screens/CalendarScreen';
import AnalyticsScreen from './screens/AnalyticsScreen';
import AssetsScreen from './screens/AssetsScreen';

const API_BASE = 'http://37.27.89.250:8092';

const Tab = createBottomTabNavigator();

const theme = {
  dark: true,
  colors: {
    primary: '#C8A84E',
    background: '#0A0A0F',
    card: '#1A1A2E',
    text: '#E8E4DD',
    border: '#1E1E35',
    notification: '#C8A84E',
  },
};

export default function App() {
  return (
    <NavigationContainer theme={theme}>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={{
          tabBarStyle: { backgroundColor: '#0E0E15', borderTopColor: '#1E1E35' },
          tabBarActiveTintColor: '#C8A84E',
          tabBarInactiveTintColor: '#5A5666',
          headerStyle: { backgroundColor: '#0E0E15', borderBottomColor: '#1E1E35' },
          headerTintColor: '#E8E4DD',
        }}
      >
        <Tab.Screen name="Studio" component={StudioScreen} />
        <Tab.Screen name="Calendar" component={CalendarScreen} />
        <Tab.Screen name="Analytics" component={AnalyticsScreen} />
        <Tab.Screen name="Assets" component={AssetsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

export { API_BASE };
