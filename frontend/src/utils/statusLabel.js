import i18n from '../i18n';

/**
 * Localized label for a backend status/enum value.
 * Looks up common:status.<value>; falls back to a humanized version of the raw
 * value (e.g. 'in_progress' -> 'In Progress') so unknown/new enums still read OK.
 * Uses the i18n singleton so it works outside React components too.
 *
 * @param {string} status - raw enum value (e.g. 'in_progress', 'on-track', 'paid')
 * @param {object} [opts] - { upper: true } to upper-case the result (for badges)
 * @returns {string}
 */
export const statusLabel = (status, opts = {}) => {
  if (!status) return '';
  const raw = String(status);
  const humanized = raw
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const label = i18n.t(`common:status.${raw}`, { defaultValue: humanized });
  return opts.upper ? label.toUpperCase() : label;
};

export default statusLabel;
