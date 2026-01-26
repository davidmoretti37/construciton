import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Image,
  Dimensions,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import * as Sharing from 'expo-sharing';
import { getColors, Spacing, FontSizes, LightColors } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function DocumentViewerScreen({ route, navigation }) {
  const { isDark = false } = useTheme() || {};
  const Colors = getColors(isDark) || LightColors;

  const { document, photo, fileUrl: directFileUrl, fileName: directFileName, fileType: directFileType } = route.params || {};
  const item = document || photo;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [scale, setScale] = useState(1);

  // Determine if it's an image or PDF - support both direct params and nested objects
  const fileUrl = directFileUrl || item?.file_url || item?.url || item?.fileUrl || '';
  const fileName = directFileName || item?.file_name || item?.fileName || item?.name || 'Document';
  const fileType = directFileType || item?.file_type || item?.type || '';

  const isImage = fileType === 'image' ||
    /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(fileUrl) ||
    fileUrl.includes('image');
  const isPDF = fileType === 'pdf' || /\.pdf$/i.test(fileUrl);

  const handleShare = async () => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable && fileUrl) {
        await Sharing.shareAsync(fileUrl, {
          mimeType: isPDF ? 'application/pdf' : 'image/*',
          dialogTitle: `Share ${fileName}`,
        });
      }
    } catch (err) {
      console.error('Error sharing:', err);
    }
  };

  const renderImage = () => (
    <ScrollView
      style={styles.imageScrollView}
      contentContainerStyle={styles.imageScrollContent}
      maximumZoomScale={4}
      minimumZoomScale={1}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      bouncesZoom={true}
      centerContent={true}
    >
      <Image
        source={{ uri: fileUrl }}
        style={styles.fullImage}
        resizeMode="contain"
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setError(true);
          setLoading(false);
        }}
      />
    </ScrollView>
  );

  const renderPDF = () => {
    // Use Google Docs viewer for PDFs on mobile
    const pdfViewerUrl = Platform.select({
      ios: fileUrl,
      android: `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(fileUrl)}`,
      default: fileUrl,
    });

    return (
      <WebView
        source={{ uri: pdfViewerUrl }}
        style={styles.webview}
        onLoadStart={() => setLoading(true)}
        onLoadEnd={() => setLoading(false)}
        onError={() => {
          setError(true);
          setLoading(false);
        }}
        startInLoadingState={true}
        scalesPageToFit={true}
        javaScriptEnabled={true}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.primaryBlue} />
            <Text style={[styles.loadingText, { color: Colors.secondaryText }]}>
              Loading PDF...
            </Text>
          </View>
        )}
      />
    );
  };

  const renderContent = () => {
    if (error) {
      return (
        <View style={styles.errorContainer}>
          <Ionicons name="alert-circle-outline" size={64} color={Colors.error} />
          <Text style={[styles.errorText, { color: Colors.primaryText }]}>
            Failed to load document
          </Text>
          <Text style={[styles.errorSubtext, { color: Colors.secondaryText }]}>
            The file may be unavailable or the format is not supported
          </Text>
        </View>
      );
    }

    if (isImage) {
      return renderImage();
    }

    if (isPDF) {
      return renderPDF();
    }

    // Fallback - try to display as image
    return renderImage();
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: Colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: Colors.surface, borderBottomColor: Colors.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="close" size={28} color={Colors.primaryText} />
        </TouchableOpacity>

        <View style={styles.titleContainer}>
          <Text style={[styles.title, { color: Colors.primaryText }]} numberOfLines={1}>
            {fileName}
          </Text>
          <Text style={[styles.subtitle, { color: Colors.secondaryText }]}>
            {isImage ? 'Image' : isPDF ? 'PDF Document' : 'Document'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleShare}
        >
          <Ionicons name="share-outline" size={24} color={Colors.primaryBlue} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={[styles.content, { backgroundColor: Colors.background }]}>
        {loading && !error && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={Colors.primaryBlue} />
          </View>
        )}
        {renderContent()}
      </View>

      {/* Footer with metadata */}
      {item && (
        <View style={[styles.footer, { backgroundColor: Colors.surface, borderTopColor: Colors.border }]}>
          {item.projectName && (
            <View style={styles.metaItem}>
              <Ionicons name="folder-outline" size={16} color={Colors.secondaryText} />
              <Text style={[styles.metaText, { color: Colors.secondaryText }]}>
                {item.projectName}
              </Text>
            </View>
          )}
          {item.uploadedBy && (
            <View style={styles.metaItem}>
              <Ionicons name="person-outline" size={16} color={Colors.secondaryText} />
              <Text style={[styles.metaText, { color: Colors.secondaryText }]}>
                {item.uploadedBy}
              </Text>
            </View>
          )}
          {(item.timestamp || item.created_at) && (
            <View style={styles.metaItem}>
              <Ionicons name="time-outline" size={16} color={Colors.secondaryText} />
              <Text style={[styles.metaText, { color: Colors.secondaryText }]}>
                {item.timestamp || new Date(item.created_at).toLocaleDateString()}
              </Text>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: Spacing.xs,
  },
  titleContainer: {
    flex: 1,
    marginHorizontal: Spacing.md,
  },
  title: {
    fontSize: FontSizes.md,
    fontWeight: '600',
  },
  subtitle: {
    fontSize: FontSizes.sm,
    marginTop: 2,
  },
  shareButton: {
    padding: Spacing.xs,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageScrollView: {
    flex: 1,
    width: SCREEN_WIDTH,
  },
  imageScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.7,
  },
  webview: {
    flex: 1,
    width: SCREEN_WIDTH,
  },
  loadingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  loadingText: {
    marginTop: Spacing.md,
    fontSize: FontSizes.md,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
  },
  errorText: {
    fontSize: FontSizes.lg,
    fontWeight: '600',
    marginTop: Spacing.md,
    textAlign: 'center',
  },
  errorSubtext: {
    fontSize: FontSizes.sm,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    gap: Spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  metaText: {
    fontSize: FontSizes.sm,
  },
});
