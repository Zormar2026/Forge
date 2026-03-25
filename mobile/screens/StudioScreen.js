import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function StudioScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Content Studio</Text>
      <Text style={styles.subtitle}>Forge content for your brand</Text>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>Phase 2 — Coming Soon</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0F', padding: 20 },
  title: { fontFamily: 'System', fontSize: 24, fontWeight: '700', color: '#E8E4DD', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#9B97A0', marginBottom: 24 },
  placeholder: { flex: 1, backgroundColor: '#1A1A2E', borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#1E1E35' },
  placeholderText: { color: '#C8A84E', fontSize: 14, fontWeight: '600' },
});
