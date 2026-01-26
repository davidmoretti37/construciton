import React from 'react';
import { Text, Linking, Platform } from 'react-native';

/**
 * LinkifiedText - Makes addresses and phone numbers in text clickable
 * Addresses open in maps, phone numbers open dialer
 */
const LinkifiedText = ({ children, style, linkStyle }) => {
  if (typeof children !== 'string') {
    return <Text style={style}>{children}</Text>;
  }

  const text = children;

  // Patterns to detect
  // Address pattern: "@ Address" or standalone addresses with numbers
  // STRICT: Requires actual street name + street type keyword (Street, Ave, etc.)
  // Must have street type as a complete word (not part of another word like "estimates")

  // Phone pattern: (xxx) xxx-xxxx or xxx-xxx-xxxx or xxxxxxxxxx
  const phonePattern = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

  // Street types must be followed by word boundary, comma, or end of string
  // This prevents matching "estimates" as containing "St"
  const streetAddressPattern = /\d+\s+(?:(?:North|South|East|West|N\.?|S\.?|E\.?|W\.?|NW|NE|SW|SE)\s+)?[A-Z][a-z]+(?:\s+[A-Z]?[a-z]+)*\s+(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Court|Ct\.?|Circle|Cir\.?|Place|Pl\.?)(?:,\s*[^•\n,]+)*(?:\s+\d{5}(?:-\d{4})?)?/g;

  // @ prefix pattern for explicit address marking
  const atAddressPattern = /@\s*\d+\s+[^•\n,]+(?:,\s*[^•\n,]+)+/g;

  // Combine patterns with capture groups
  const combinedPattern = /(@\s*\d+\s+[^•\n,]+(?:,\s*[^•\n,]+)+)|(\d+\s+(?:(?:North|South|East|West|N\.?|S\.?|E\.?|W\.?|NW|NE|SW|SE)\s+)?[A-Z][a-z]+(?:\s+[A-Z]?[a-z]+)*\s+(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Drive|Dr\.?|Lane|Ln\.?|Way|Court|Ct\.?|Circle|Cir\.?|Place|Pl\.?)(?:,\s*[^•\n,]+)*(?:\s+\d{5}(?:-\d{4})?)?)|(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g;

  const parts = [];
  let lastIndex = 0;
  let match;

  while ((match = combinedPattern.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      });
    }

    const matchedText = match[0];

    // Determine if it's an address or phone
    if (match[3]) {
      // Phone number
      parts.push({
        type: 'phone',
        content: matchedText,
      });
    } else {
      // Address (either @ format or standalone)
      parts.push({
        type: 'address',
        content: matchedText,
      });
    }

    lastIndex = match.index + matchedText.length;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.slice(lastIndex),
    });
  }

  // If no matches found, return plain text
  if (parts.length === 0) {
    return <Text style={style}>{text}</Text>;
  }

  const openMaps = (address) => {
    // Clean up the address - remove @ symbol if present
    const cleanAddress = address.replace(/^@\s*/, '').trim();
    const encodedAddress = encodeURIComponent(cleanAddress);

    const url = Platform.select({
      ios: `maps:0,0?q=${encodedAddress}`,
      android: `geo:0,0?q=${encodedAddress}`,
    });

    Linking.openURL(url).catch(() => {
      // Fallback to Google Maps web URL
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
          return <Text key={index}>{part.content}</Text>;
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
