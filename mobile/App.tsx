import React from 'react';
import { StyleSheet, Text, View, SafeAreaView, ScrollView } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// 健保シミュレーター スマホアプリ用メインコンポーネント
export default function App() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      {/* ヘッダーエリア */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>健保シミュレーター</Text>
      </View>

      {/* メインコンテンツエリア */}
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📱 スマホアプリ版へようこそ</Text>
          <Text style={styles.cardText}>
            ここから画面構成や機能を自由にカスタマイズ・追加していくことができます。
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f5f7fa' },
  header: {
    paddingTop: 50,
    paddingBottom: 15,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#ffffff' },
  container: { padding: 20 },
  card: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8, color: '#1e293b' },
  cardText: { fontSize: 14, color: '#64748b', lineHeight: 20 },
});
