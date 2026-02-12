import React from 'react';
import { Text, Linking, Platform } from 'react-native';

/**
 * Parses markdown bold (**text**) into segments.
 * Returns array of { text, bold } objects.
 */
function parseMarkdownBold(str) {
  const segments = [];
  const regex = /\*\*(.*?)\*\*/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(str)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: str.slice(lastIndex, match.index), bold: false });
    }
    segments.push({ text: match[1], bold: true });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < str.length) {
    segments.push({ text: str.slice(lastIndex), bold: false });
  }

  return segments.length === 0 ? [{ text: str, bold: false }] : segments;
}

/**
 * Renders a string with **bold** markdown applied.
 */
function renderFormattedText(str, key) {
  const segments = parseMarkdownBold(str);
  if (segments.length === 1 && !segments[0].bold) {
    return <Text key={key}>{str}</Text>;
  }
  return segments.map((seg, i) => (
    <Text key={`${key}-${i}`} style={seg.bold ? { fontWeight: '700' } : undefined}>
      {seg.text}
    </Text>
  ));
}

/**
 * LinkifiedText - Renders markdown bold, and makes addresses/phone numbers clickable.
 * Addresses open in maps, phone numbers open dialer.
 */
const LinkifiedText = ({ children, style, linkStyle }) => {
  if (typeof children !== 'string') {
    return <Text style={style}>{children}</Text>;
  }

  const text = children;

  // Phone pattern: (xxx) xxx-xxxx or xxx-xxx-xxxx or xxxxxxxxxx
  const phonePattern = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

  // US street address pattern: "123 Main Street, City, State ZIP"
  const streetAddressPattern = /\d+\s+(?:(?:North|South|East|West|N\.?|S\.?|E\.?|W\.?|NW|NE|SW|SE)\s+)?[A-Z][a-z]+(?:\s+[A-Z]?[a-z]+)*\s+(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Court|Ct\.?|Circle|Cir\.?|Place|Pl\.?)(?:,\s*[^•\n,]+)*(?:\s+\d{5}(?:-\d{4})?)?/g;

  // International address pattern: "Street Name, Number - City, State, ZIP, Country"
  // Matches Brazilian, European, and other international formats
  const internationalAddressPattern = /(?:Rua|Avenida|Alameda|Travessa|Praça|Estrada|Rodovia|Via|Street|Avenue|Road|Boulevard|Drive|Lane|Way|Court|Place)\s+[A-Z][^,\n]+,\s*\d+(?:\s*-\s*[A-Z][^,\n]+,\s*[A-Z][^,\n]+(?:\s*-\s*[A-Z]{2})?(?:,\s*[\d-]+)?(?:,\s*[A-Z][a-z]+)?)?/gi;

  // @ prefix pattern for explicit address marking
  const atAddressPattern = /@\s*\d+\s+[^•\n,]+(?:,\s*[^•\n,]+)+/g;

  // Combine patterns with capture groups
  // Priority: @ prefix > International > US > Phone
  const combinedPattern = /(@\s*\d+\s+[^•\n,]+(?:,\s*[^•\n,]+)+)|((?:Rua|Avenida|Alameda|Travessa|Praça|Estrada|Rodovia|Via|Street|Avenue|Road|Boulevard|Drive|Lane|Way|Court|Place)\s+[A-Z][^,\n]+,\s*\d+(?:\s*-\s*[A-Z][^,\n]+,\s*[A-Z][^,\n]+(?:\s*-\s*[A-Z]{2})?(?:,\s*[\d-]+)?(?:,\s*[A-Z][a-z]+)?)?)|(\d+\s+(?:(?:North|South|East|West|N\.?|S\.?|E\.?|W\.?|NW|NE|SW|SE)\s+)?[A-Z][a-z]+(?:\s+[A-Z]?[a-z]+)*\s+(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Court|Ct\.?|Circle|Cir\.?|Place|Pl\.?)(?:,\s*[^•\n,]+)*(?:\s+\d{5}(?:-\d{4})?)?)|(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/gi;

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = combinedPattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      });
    }

    const matchedText = match[0];

    // match[1] = @ prefix address
    // match[2] = international address
    // match[3] = US address
    // match[4] = phone
    if (match[4]) {
      parts.push({ type: 'phone', content: matchedText });
    } else {
      parts.push({ type: 'address', content: matchedText });
    }

    lastIndex = match.index + matchedText.length;
  }

  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.slice(lastIndex),
    });
  }

  // If no link matches found, render with just markdown formatting
  if (parts.length === 0) {
    return <Text style={style}>{renderFormattedText(text, 'root')}</Text>;
  }

  const openMaps = (address) => {
    const cleanAddress = address.replace(/^@\s*/, '').trim();
    const encodedAddress = encodeURIComponent(cleanAddress);

    const url = Platform.select({
      ios: `maps:0,0?q=${encodedAddress}`,
      android: `geo:0,0?q=${encodedAddress}`,
    });

    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`);
    });
  };

  const openPhone = (phone) => {
    const cleanPhone = phone.replace(/[^\d]/g, '');
    Linking.openURL(`tel:${cleanPhone}`);
  };

  const defaultLinkStyle = {
    color: '#007AFF',
    textDecorationLine: 'underline',
  };

  return (
    <Text style={style}>
      {parts.map((part, index) => {
        if (part.type === 'text') {
          return renderFormattedText(part.content, index);
        }

        if (part.type === 'address') {
          return (
            <Text
              key={index}
              style={[defaultLinkStyle, linkStyle]}
              onPress={() => openMaps(part.content)}
            >
              {part.content}
            </Text>
          );
        }

        if (part.type === 'phone') {
          return (
            <Text
              key={index}
              style={[defaultLinkStyle, linkStyle]}
              onPress={() => openPhone(part.content)}
            >
              {part.content}
            </Text>
          );
        }

        return <Text key={index}>{part.content}</Text>;
      })}
    </Text>
  );
};

export default LinkifiedText;
