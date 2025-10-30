/**
 * Unidecode-plus takes full-range Unicode text and tries to represent it using only US-ASCII characters (i.e., the
 * universally displayable characters between 0x00 and 0x7F). The representation is generally an attempt at
 * transliteration -- i.e., conveying, in Roman letters, the pronunciation expressed by the text in some other writing
 * system. Some of the transliterations go for matching the _shape_ of characters rather than their pronunciation, such
 * as transliterating the Greek letter `ρ` (rho) as the ASCII `p`, even though it sounds more like an `r`. Various
 * emojis are represented either as "ASCII art" or English text.
 *
 * The tables used (in the data folder) are converted from the tables provided in the Perl libraryText::Unidecode
 * (http://search.cpan.org/dist/Text-Unidecode/lib/Text/Unidecode.pm) and are distributed under the Perl license.
 *
 * Whereas the original JavaScript and Perl versions of Unidecode only worked the Unicode Basic Multilingual Plane
 * (BMP, U+0 to U+FFFF), this version also handles transliteration of some characters beyond the BMP, like popular
 * emojis.
 *
 * @author Kerry Shetline
 *
 * Based on Francois-Guillaume Ribreau's unidecode, which in turn was based on a port of unidecode for Perl.
 */

'use strict';

const dataCache = {};

let codepoints;
try {
  // Can we use Unicode-aware regexes?
  codepoints = /[^\x00-\x7F]/gu; // jshint ignore:line
} catch (err) {
  // Nope! This mess will have to do.
  codepoints = /(?:[\x80-\uD7FF\uE000-\uFFFF]|[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF])/g;
}

function prepareOptions(options) {
  return {
    ...(options.german !== undefined ? { german: options.german } : { german: false }),
    ...(options.deferredSmartSpacing !== undefined ? { deferredSmartSpacing: options.deferredSmartSpacing } : { deferredSmartSpacing: false }),
    ...(options.deferredSmartSpacing ? { smartSpacing: true } : (options.smartSpacing !== undefined ? { smartSpacing: options.smartSpacing } : { smartSpacing: false })),
    ...(options.skipRanges !== undefined ? { skipRanges: options.skipRanges } : { skipRanges: [] }),
  };
}

module.exports = function unidecode(inputStr, inputOptions) {
  if (!inputStr) {
    return '';
  }

  const options = prepareOptions(inputOptions ?? {});

  let str = inputStr;

  if (options.german) {
    str = str.replace(/([AOU])\u0308/g, '$1E').replace(/([aou])\u0308/g, '$1e');
  }

  str = str.replace(codepoints, (match) => {
    return replacer(match, options);
  });

  if (!options.smartSpacing || options.deferredSmartSpacing) {
    return str;
  } else {
    return resolveSpacing(str);
  }
};

function replacer(char, options) {
  const cp = char.codePointAt(0);

  if (options.skipRanges.length > 0) {
    for (let i = 0; i < options.skipRanges.length; ++i) {
      if (options.skipRanges[i][0] <= cp && cp <= options.skipRanges[i][1]) {
        return char;
      }
    }
  }

  const high = cp >> 8;
  const row = high + (high === 0 && options.german ? 0.5 : 0);
  const low = cp & 0xFF;
  const emDash = cp === 0x2014;
  // This doesn't cover all emoji, just those currently defined.
  const emoji = (high === 0x1F4 || high === 0x1F6 || high === 0x1F9);

  if (0x18 < high && high < 0x1E || 0xD7 < high && high < 0xF9) {
    return ''; // Isolated high or low surrogate
  } else if (high > 0xFF && !emoji) {
    return '_';
  }

  if (!dataCache[row]) {
    try {
      dataCache[row] = require('./data/x' + (row < 0x10 ? '0' : '') + row.toString(16));

      // I'm not sure why, but a fair number of the original data tables don't contain a full 256 items.
      if (dataCache[row].length < 256) {
        const start = dataCache[row].length;
        dataCache[row].length = 256;
        dataCache[row].fill('_', start);
      }
    } catch (err) {
      dataCache[row] = new Array(256).fill('_');
    }
  }

  const newChar = dataCache[row][low];

  if (options.smartSpacing && emDash) {
    return '\x80--\x80';
  } if (!options.smartSpacing || newChar === '[?]' || newChar === '_' || /^\w+$/.test(newChar)) {
    return newChar;
  } else if (emoji) {
    return '\x80\x81' + newChar + '\x81\x80';
  } else {
    return '\x80' + newChar.trim() + '\x80';
  }
}

function resolveSpacing(str) {
  return str
    .replace(/(\w)(\x80--\x80)(\w)/g, (_, p1, _2, p3) => p1 + ' - ' + p3)
    .replace(/\x80(?!\w)/g, "")
    .replace(/\x80\x80|(\w)\x80/g, "$1\x81")
    .replace(/\x80/g, "")
    .replace(/^\x81+|\x81+$/g, "")
    .replace(/\x81 \x81/g, "  ")
    .replace(/\s?\x81+/g, " ");
}

module.exports.resolveSpacing = resolveSpacing;
