/** GDPR privacy notice, shown in fine print on the forms and in the footer. */
export function PrivacyNotice({ className = "" }: { className?: string }) {
  return (
    <div className={`text-[11px] leading-snug ${className}`}>
      <p className="font-semibold">Privacy Notice and Consent</p>
      <p className="mt-1">
        The information you provide will be used only for the purpose stated at the time of collection. Your information
        will not be used for any other purpose without your consent. By providing your information, you acknowledge and
        agree to its use for the stated purpose.
      </p>
    </div>
  );
}
