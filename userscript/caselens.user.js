// ==UserScript==
// @name         CaseLens — Unofficial USCIS Case Tracker
// @namespace    https://github.com/itsericqiu/uscis-caselens
// @version      1.20.0
// @description  See all your USCIS cases in one place. Everything stays in your browser.
// @match        https://my.uscis.gov/*
// @run-at       document-idle
// @noframes
// @homepageURL  https://github.com/itsericqiu/uscis-caselens
// @supportURL   https://github.com/itsericqiu/uscis-caselens/issues
// @downloadURL  https://github.com/itsericqiu/uscis-caselens/releases/latest/download/caselens.user.js
// @updateURL    https://github.com/itsericqiu/uscis-caselens/releases/latest/download/caselens.user.js
// @grant        none
// ==/UserScript==

// CaseLens — USCIS event code dictionary
//
// Source: NIEM (National Information Exchange Model) open federal standard,
// type scr:BenefitDocumentStatusCategoryCodeSimpleType (NIEM 2.1).
// https://www.datypic.com/sc/niem21/t-scr_BenefitDocumentStatusCategoryCodeSimpleType.html
// These are USCIS's INTERNAL operations descriptions, not customer-facing
// status language. Retrieved 2026-08-10. 492 entries (the schema's complete
// enumeration -- not a sample).
//
// Descriptions are the schema's own text, converted from ALL-CAPS to sentence
// case. A handful of federal acronyms are kept upper-case on purpose (USCIS,
// INS, DOS, EOIR, AAO, FBI, ASC, NBC, ICF, ICPS, BFU, FDU, EAD, DHS, OSC,
// MFAS, ADIT, RFE, POE, DOB, MO, A#) along with form/reference numbers like
// I-90, I-698, FD-258, T-1, SB1, and IBS1-4. Everything else -- including
// other undocumented abbreviations the schema didn't flag (SC, AMC, MRZ,
// OCR-B, and the like) -- is left in plain sentence case as USCIS wrote it.
//
// Verified against live case data: IAF, FTA0, LDA, DA all match exactly:
//   IAF  = "Receipt letter emailed"
//   FTA0 = "Database checks received"
//   LDA  = "Card produced"
//   DA   = "Approved/notice ordered"
//
// Known gap: USCIS also uses codes absent from this schema (e.g. "SA", which
// marks a case approved, and "RCV0"). Unknown codes are handled explicitly
// by the UI -- this file is not exhaustive of every code USCIS has ever used,
// only of every code NIEM 2.1 documents.
//
// A few source rows have quirks worth knowing about, preserved faithfully
// rather than "fixed":
//   - Code "AA0" is officially described as "AAO ATTORNEY ATTACHED" in the
//     schema (an actual reference to the Administrative Appeals Office, not
//     a typo of the code) -- kept as-is, "AAO attorney attached".
//   - Code "BK1" is described as "BL1 PHYSICAL CASE FILE RELOCATED..." in
//     the schema -- likely an upstream data-entry slip (compare to the
//     legitimate BL2/BL3 codes below), reproduced as written.
//   - Code ",A96" (a literal leading comma in the schema's value column,
//     almost certainly a rendering artifact) was corrected to "MA96" here
//     because its own description text ("MA96 OCR-B FIELD MISSING(BLANK)")
//     confirms the intended code and it fits the MA9x family (MA90-MA99).
//   - "Card in Production", "Card Undeliverable", "Card Destroyed", and
//     "Card Resent" are real enumeration values in the schema -- not typical
//     short codes, but included for completeness.
var USCIS_CODE_MEANINGS = {
  'AA': 'Base fee adjustment made',
  'AA0': 'AAO attorney attached',
  'AAB': 'Received - fingerprint fee',
  'AAC': 'Base fee adjustment made',
  'AALB': 'Received at the lockbox',
  'ABA': 'Received, fee waived',
  'ABB': 'Received - fee collected elsewhere',
  'ACA': 'Received, fee in suspense',
  'ACB': 'Fee suspense action - determined that fee required',
  'ACC': 'Fee suspense removed - rejected since fee not paid',
  'ADA': 'Fee suspense removed - fee accepted',
  'ADB': 'Fee suspense removed - fee waived',
  'ADC': 'Fee suspense removed - no fee required',
  'AE': 'Case resubmitted',
  'AF': 'Rejected',
  'AFAA': 'Rejected/check/MO not signed',
  'AFAB': 'Rejected/application/petition not signed',
  'AFAC': 'Rejected/incorrect or no fee',
  'AFAD': 'Rejected/not current version of form',
  'AFAE': 'Rejected/case improperly appealed',
  'AFAI': 'Reject/form not signed/incorrect fee',
  'AFBA': 'Rejected/check/MO & application/petition not signed',
  'AFBB': 'Rejected/check/MO not signed and incorrect or no fee',
  'AFBC': 'Rejected/check/MO not signed & not current version of form',
  'AFBD': 'Rejected/check/MO not signed & case improperly appealed',
  'AFBE': 'Rejected/application/petition not signed and incorrect or no fee',
  'AFBF': 'Rejected/app/pet not signed & not current version of form',
  'AFBG': 'Rejected/application/petition not signed & case improperly appeal',
  'AFBH': 'Rejected/incorrect or no fee & not current version of form',
  'AFBI': 'Rejected/incorrect or no fee & case improperly appealed',
  'AFBJ': 'Rejected/not current version of form & case improperly appealed',
  'AFCA': 'Rejected/check/MO & app/pet not signed and incorrect or no fee',
  'AFCB': 'Rejected/check/MO & app/pet not signed & not current form',
  'AFCC': 'Rejected/check/MO & app/pet not signed & case improperly appealed',
  'AFCD': 'Rejected/check/MO not signed, incorrect fee, not current form',
  'AFCE': 'Rejected/check/MO not signed, incorrect fee, improper appeal',
  'AFCF': 'Rejected/check/MO not signed, not current form, improper appeal',
  'AFCG': 'Rejected/app/pet not signed, incorrect fee, not current form',
  'AFCH': 'Rejected/app/pet not signed, incorrect fee, improper appeal',
  'AFCI': 'Rejected/app/pet not signed, not current form, improper appeal',
  'AFCJ': 'Rejected/incorrect fee, not current form, improper appeal',
  'AFDA': 'Rejected/check/MO & app/pet not signed, incorr fee, not curr form',
  'AFDB': 'Rejected/check/MO & app/pet not signed, incorr fee, improp appeal',
  'AFDC': 'Rejected/check/MO & app/pet not signed, not curr form, improp app',
  'AFDD': 'Rejected/check/MO not signed, no fee, not curr form, improp app',
  'AFDE': 'Rejected/app/pet not signed, no fee, not curr form, improp appeal',
  'AFEA': 'Rejected/nothing signed, incorrect fee, not curr form, improp app',
  'AFFA': 'Rejected/filed too early',
  'AFZZ': 'Rejected/other',
  'AGA': 'Reopened or reconsidered on service motion without appeal',
  'AGB': 'Reopened/reconsidered on USCIS motion based on appeal',
  'AH': 'Reopened by court remand',
  'AI': 'Terminated case reopened',
  'AJA': 'Check bounced, case not yet completed',
  'AJB': 'Check bounced, case already approved',
  'AJC': 'Check bounced, case already denied, revoked, or abandoned',
  'AKA': 'Bounced check corrected on case not yet completed',
  'AKB': 'Bounced check corrected on case already approved',
  'AKC': 'Bounced check corrected on case already denied',
  'ALA': 'Bounced check not corrected, rejected',
  'ALB': 'Bounced check not corrected, revoked',
  'ALC': 'Bounced check not corrected on previous denial',
  'ALD': 'Bounced check correction deficient',
  'AMA': 'Credit card verification suspense',
  'AMB': 'Credit card payment approved',
  'AMC': 'Credit card payment rejected',
  'AMD': 'Credit card verification unsuccessful',
  'ANA': 'Fee refunded',
  'ANB': 'Fee refund sent',
  'ANC': 'Fee surcharge refunded',
  'AOA': 'Fpf deficiency - incorrect amount',
  'AOB': 'Fpf deficiency - remittance not signed',
  'AOC': 'Fpf deficiency - remittance not signed and incorrect amount',
  'BA': 'Relocated for processing',
  'BAA': 'Remoted for processing',
  'BB': 'Relocated to new jurisdiction',
  'BC': 'Relocated from sc to local office for standard interview',
  'BD': 'Relocated from sc for field review or investigation',
  'BE': 'Appeal/motion/certification sent to AAO',
  'BF': 'Appeal/motion/certification sent to EOIR',
  'BG': 'Relocated to originating office by AAO',
  'BH': 'Relocated to originating office by EOIR',
  'BI': 'Relocated to origination office by DOS for review',
  'BJ': 'Relocate to asylum office',
  'BK': 'Relocated to MFAS',
  'BK0': 'Motion to appellate body',
  'BK1': 'Bl1 physical case file relocated from NBC to field office',
  'BL2': 'Electronic file relocated from ASC to NBC',
  'BL3': 'Electronic file relocated from ASC to field office',
  'CA': 'Relocated received from other INS center or office',
  'CB': 'Relocated received from AAO',
  'CC': 'Relocated received from EOIR',
  'CD': 'Case relocated received from state department for review',
  'Card Destroyed': 'Card Destroyed',
  'Card Resent': 'Card Resent',
  'Card Undeliverable': 'Card Undeliverable',
  'Card in Production': 'Card in Production',
  'DA': 'Approved/notice ordered',
  'DAEA': 'Split decision/notice ordered',
  'DB': 'Approved & certified/notice ordered',
  'DC': 'Approved in part/notice ordered',
  'DD': 'Approved in part & certified/notice ordered',
  'DE': 'Case ordered approved by AAO/notice ordered',
  'DF': 'Case ordered approved by EOIR/notice ordered',
  'DG': 'Case ordered approved by court/notice ordered',
  'DH': 'Approved on service motion/notice ordered',
  'DI': 'Approval reaffirmed after DOS return/notice ordered',
  'DJ': 'Visa issued by DOS',
  'EA': 'Denial notice ordered',
  'EA0': 'Local office final decision',
  'EAA': 'Deny for some - order notice',
  'EB': 'Denial & certification notice ordered',
  'EBA': 'Deny for some and certify - order notice',
  'EC': 'Denial notice with finding of fraud ordered',
  'ED': 'Denial & certification notice with finding of fraud ordered',
  'EE': 'Case ordered denied by AAO',
  'EF': 'Case ordered denied by EOIR',
  'EGA': 'Revocation notice ordered',
  'EGB': 'Revocation notice with finding of fraud ordered',
  'EGC': 'Revocation & certification notice ordered',
  'EGD': 'Revocation & certification notice w/finding of fraud ordered',
  'EH0': 'Rescission',
  'EHA': 'Rescission notice ordered',
  'EHA0': 'Rescission filed',
  'EHB': 'Rescission notice with finding of fraud ordered',
  'EHC': 'Rescission & certification notice ordered',
  'EHD': 'Rescission & certification w/finding of fraud ordered',
  'EI': 'Denial of motion notice ordered',
  'EJ': 'Motion granted - denial of renewed case notice ordered',
  'EK': 'Withdrawal acknowledgment notice ordered',
  'EL': 'Abandonment denial notice ordered',
  'EM': 'Automatic termination per oi 103.2(o) notice ordered',
  'EN': 'Case terminated; status acquired through other means',
  'EO': 'Visa denied by DOS',
  'EP': 'Petition terminated by DOS',
  'EQ': 'Petition revoked by DOS',
  'ER': 'Service denial upheld by court',
  'ERA0': 'Court appeal filed',
  'ERB0': 'Svc directed let previous appvl stand',
  'ES0': 'Deny other',
  'EW0': 'Automatically revoke',
  'EX': 'System closure',
  'EX0': 'Appeal withdrawn - administrative',
  'EY2': 'Phase i decision changed to t',
  'EZ': 'Administrative close',
  'FA': 'Case return for additional evidence notice ordered',
  'FAA': 'Litigation case loaded',
  'FAB': 'Cis add confirmed',
  'FB0': 'Request evidence',
  'FBA': 'Initial evidence request notice ordered',
  'FBB': 'Additional evidence request notice ordered',
  'FBC': 'Initial and additional evidence requested notice ordered',
  'FC': 'Intent to revoke notice ordered',
  'FCA0': 'Intent to revoke - fraud',
  'FCB0': 'Intent to revoke - other',
  'FD': 'Intent to rescind notice ordered',
  'FE': 'Intent to deny notice ordered',
  'FF0': 'Sent to benefit fraud unit (BFU)',
  'FF1': 'Sent to fraud detection unit (FDU) for analysis',
  'FF2': 'Sent to national security adjudications unit for analysis',
  'FFA': 'Overseas investigation requested',
  'FFB': 'Domestic investigation requested',
  'FG': 'Non-USCIS advisory opinion requested',
  'FG0': 'Forwarded for service brief',
  'FH': 'Place in interview que',
  'FHA': 'Schedule case for asylum interview',
  'FHB': 'Ready for interview scheduling',
  'FI': 'Force schedule interview',
  'FJ': 'Interview scheduled/notice ordered',
  'FKA': 'Deschedule',
  'FKB': 'Cancel interview based on request',
  'FL': 'Failed to appear for interview or ADIT processing',
  'FLR': 'Return from law enforcement support center',
  'FLS': 'Sent to law enforcement support center',
  'FM': 'Reschedule interview',
  'FN': 'Fingerprint/agency checks ordered',
  'FNA': 'Fingerprint appointment notice ordered',
  'FNB': 'Fingerprints taken',
  'FNC': 'FD-258 sent to FBI',
  'FND': 'FD-258 rejected by FBI-immediate reject',
  'FNE': 'FD-258 rejected by FBI-unclassifiable',
  'FNF': 'FD-258 resent to FBI',
  'FNG': 'Fingerprint processing complete-ident',
  'FNH': 'Fingerprint processing complete-non-ident',
  'FNI': 'Fbisched fingerprint status adjusted',
  'FO0': 'Request file',
  'FOA': 'File transfer request ordered - processing not suspended',
  'FOB': 'File transfer request ordered - processing suspended',
  'FP': 'ADIT processing requested after approval',
  'FQ': 'Request ADIT re-processing/notice ordered',
  'FQA': 'Request for notice ordered',
  'FQB': 'Notice to appear ordered',
  'FR': 'Adjudication hold lifted',
  'FS': 'Adjudication hold placed',
  'FSA0': 'Request database checks',
  'FT': 'Processing hold lifted',
  'FT0': 'Officer processing begun',
  'FTA0': 'Database checks received',
  'FU': 'Eligible to file supplemental waiver or app.; notice ordered',
  'FV': 'Continued for civics and/or english retest; case on hold',
  'FWA': 'Terminate action to revoke',
  'FWB': 'Terminate action to rescind',
  'FX0': 'Extension for brief granted',
  'FXA': 'Terminate placement in interview que',
  'FXX0': 'Extension for brief denied',
  'FY0': 'Treat as motion',
  'FYD': 'Legalization phase 1 l.o. recommendation of denial',
  'FYG': 'Legalization phase 1 l.o. recommendation of grant',
  'FZA': 'T-1 waiting list',
  'FZB': 'Bona fide deferred action',
  'FZC': 'Bona fide in removal',
  'HA': 'Response to request notice to application/petition received',
  'HA0': 'Waiver request',
  'HA1': 'Imbra waiver approval',
  'HA2': 'Imbra waiver denial',
  'HAP': 'Reset premium proc. clock - evidence received',
  'HB': 'Notice returned as undeliverable',
  'HC': 'Investigative report/agency checks received',
  'HCB0': 'Ret from fraud unit normal process',
  'HCC0': 'Return from benefit fraud unit (BFU) with results',
  'HCC1': 'Return from fraud detection unit (FDU) with results',
  'HD': 'Correspondence received',
  'HE': 'Request to re-schedule interview received',
  'HF': 'ADIT processing completed',
  'HG': 'Interview conducted',
  'HH': 'Investigation or field review not accepted',
  'HI': 'I-89 received',
  'HJ0': 'File received',
  'HK0': 'Confirmed dau results received',
  'IA0': 'Proyesto san pablo/ INS note sent',
  'IAA': 'Receipt notice sent',
  'IAAA': 'Receipt notice w/request for I-89 processing sent',
  'IAB': 'Modified receipt notice 1 sent',
  'IAC': 'Modified receipt notice 2 sent',
  'IAD': 'Fee collected elsewhere receipt notice sent',
  'IAE': 'Fingerprint fee receipt notice sent',
  'IAF': 'Receipt letter emailed',
  'IBA': 'Fee suspense receipt notice sent',
  'IBB': 'Fee suspense - fee now required notice sent',
  'IBC': 'Fee suspense rejection notice sent',
  'IBD': 'Fee suspense removal notice sent',
  'IBE': 'Fingerprint billing notice sent',
  'IBS1': 'No system identified derogatory information',
  'IBS2': 'IBS2: Pending',
  'IBS3': 'IBS3: DNR (Does Not Relate)',
  'IBS4': 'IBS4: Resolved',
  'IC': 'Rejection notice sent',
  'ICA': 'Fingerprint fee deficiency notice sent',
  'ID': 'Resubmission acknowledgment notice sent',
  'IEA': 'Approval notice sent',
  'IEB': 'Certification approval notice sent',
  'IEC': 'Welcome notice sent',
  'IEE': 'Approval letter emailed',
  'IFA': 'Denial notice sent',
  'IFAA': 'Abandonment denial notice sent, incorrect fp fee',
  'IFAB': 'Abandonment denial notice sent, failure to appear for fp',
  'IFAC': 'Abandonment denial notice sent, fp appear. requests undeliverable',
  'IFAD': 'Abandonment denial notice sent, fingerprint fee not received',
  'IFAE': 'Abandonment denial notice sent, subj. abroad not submitted fp',
  'IFAF': 'Abandonment denial notice sent, subj. not suppl. deficiency data',
  'IFB': 'Certification denial notice sent',
  'IG': 'Duplicate notice sent',
  'IH': 'Amended notice sent',
  'II': 'Notice of intent to deny sent',
  'IJ': 'Independent cable sent or POE telephoned',
  'IK': 'Request for additional evidence sent',
  'IKE': 'Initial evidence requested via e-filing system',
  'IKF': 'Initial evidence reminder emailed',
  'IKP': 'Stop premium proc. clock - request for evidence sent',
  'IL': 'Return notice + case sent',
  'IM': 'Interview notice sent',
  'IMAF': 'Fingerprint appointment notice sent',
  'IN': 'ADIT notice sent',
  'IO': 'Reopening notice sent',
  'IP': 'Transfer notice sent',
  'IQ': 'Affirmation notice',
  'IQB': 'Bona fide deferred action notice sent',
  'IQC': 'Bona fide in removal notice sent',
  'IR': 'Revocation notice sent',
  'IS': 'Rescission notice sent',
  'IT': 'Withdrawal acknowledgment notice sent',
  'IU': 'Notice of intent to rescind sent',
  'IV': 'Notice of intent to revoke sent',
  'IWA': 'Check deficiency notice 1 sent',
  'IWB': 'Check deficiency notice 2 sent',
  'IWC': 'Check deficiency notice 3 sent',
  'IWD': 'Check deficiency rejection notice sent',
  'IWE': 'Check deficiency revocation notice sent',
  'IWF': 'Check deficiency on denial notice sent',
  'IWG': 'Bounced check correction not accepted notice sent',
  'IXAA': 'Interview cancellation by INS - notice sent',
  'IXAB': 'Interview cancellation per request - notice sent',
  'IXB': 'Continuation notice sent',
  'IXC': 'Notice to appear sent',
  'IYA': 'Intent to terminate status notice sent',
  'IYB': 'Status termination notice sent',
  'IYC': 'Status termination certification notice sent',
  'IZ': 'Litigation notice sent',
  'IZB': 'Litigation terminate mailer sent',
  'IZZ': 'Fy05 omnibus spending bill cap exemption',
  'JA': 'Eligibility notice sent',
  'JB': 'Fee refund invitation sent',
  'JC': 'Fax reply sent',
  'JCA': 'Customer inquiry response sent',
  'JZ': 'Notice generated',
  'JZA': 'I-90 attorney notice sent',
  'KA': 'Supervisory hold placed',
  'KAA': 'Supervisory hold/no inspector stamp',
  'KAB': 'Supervisory hold/no inspector signature',
  'KAC': 'Supervisory hold/no applicant signature',
  'KAD': 'Supervisory hold/i89 not attached',
  'KAE': 'Supervisory hold/missing biometric data',
  'KAF': 'Supervisory hold/missing biographic data',
  'KAG': 'Supervisory hold/no adjudicator stamp',
  'KB0': 'Hold otherwise removed',
  'KBA': 'Supervisory hold cleared - action confirmed',
  'KBB': 'Supervisory hold cleared - action cancelled',
  'KBC': 'Add. req approved by level 1, case hold awaiting level 2 approval',
  'KBD': 'Add. card request not approved by level 1 supv, action cancelled',
  'KBE': 'Add. card request approved by level 2 supv, action confirmed',
  'KBF': 'Add. card request not approved by level 2 supv, action cancelled',
  'KC': 'Quality review hold placed',
  'KDA': 'Quality review hold cleared - action confirmed',
  'KDB': 'Quality review hold cleared - action cancelled',
  'KE': 'Data changed in record',
  'KEA': 'Address change',
  'KEAN': 'A number change',
  'KEB': 'Date of birth change',
  'KEN': 'Name change',
  'KF': 'Case profile hold placed',
  'KF0': 'Execute profile',
  'KG': 'Case profile hold cleared',
  'KH': 'Pending litigation hold placed',
  'KI': 'Litigation hold cleared',
  'KJ': 'Optical record created',
  'KK': 'Previous action cancelled',
  'KL': 'Previous action cancelled - fee to be returned',
  'KM': 'Paper record destroyed',
  'KN': 'Paper record archived',
  'KO': 'Petition shipped to DOS after approval or reaffirmation',
  'KP': 'Petition shipped by DOS to consulate',
  'KQ': 'Previous action voided',
  'KR0': 'AAO conversion record',
  'KSB': 'Class SB1 - processing complete',
  'LAA': 'Card request sent to ICPS print server',
  'LAB': 'Card order corrected or verified and resent to ICF',
  'LBA': 'Card order received at ICF',
  'LC': 'Card order returned to ordering office for verification/correct.',
  'LDA': 'Card produced',
  'LDB': 'Card destroyed; did not meet specifications',
  'LEA': 'Card mailed to applicant',
  'LEB': 'Card mailed to amc',
  'LEC': 'Card personally given to applicant',
  'LFA': 'Card returned as undeliverable',
  'LFB': 'Card destroyed since undeliverable',
  'LFC': 'Card not delivered and not returned',
  'LGA': 'Card returned with correspondence',
  'LGB': 'Card destroyed since returned with correspondence',
  'LIC': 'Fingerprint not readable',
  'LLBB': 'I-89 received no companion electronic record',
  'LLBC': 'Electronic record received, no companion I-89',
  'LLBD': 'Visa or adj. record received, no companion I-89',
  'LLBE': 'ICF does not process SB1 visas',
  'LLGA': 'Applicant signature does not meet specifications',
  'LLGB': 'No applicant signature on I-89 and not shown as waived',
  'LLH': 'Photographs do not meet specifications',
  'LLIA': 'Fingerprint not readable',
  'LLIB': 'Fingerprint missing and not under age or waived',
  'LLJA': 'I-89 damaged and cannot be used',
  'LLJB': 'Photographs damaged and cannot be used',
  'LLKA': 'Card order data inconsistent with other records',
  'LLKB': 'Other records indicate applicant has naturalized',
  'LLKC': 'A# previously used on card issued to someone else',
  'LLKD': 'Discrepancy in A# on material submitted',
  'LLKE': 'DOB and adj/admission date incompatible',
  'LLKF': 'Wrong side of I-89 completed for this transaction',
  'LLKG': 'Necessary data for this type card order missing or illegible',
  'LLKH': 'Subjects conditional period has expired',
  'LLKI': 'Removal of conditional status appears premature',
  'LLKJ': 'Admission code and date of admission incompatible',
  'LLKK': 'Data and photo clearly incompatible',
  'LLLA': 'Verifying signature and data missing, incomplete or illegible',
  'LLLB': 'Admission data or admission stamp illegible on visa',
  'LLLC': 'Wrong issue of card returned with card order',
  'LLM': 'Card order appears to be duplicate',
  'LM': 'Duplicate card order',
  'LN': 'Fingerprint determined to be best available',
  'LO': 'Card not produced since conditional status expires within 60 days',
  'LPA': 'Card order withdrawn',
  'LSP': 'Stop card production',
  'M01': 'No photo available',
  'M01F': 'Fingerprint not waived',
  'M01S': 'Signature not waived',
  'M02': 'Improper photo',
  'M02S': 'Improper signature',
  'M03': 'Photo mismatch',
  'M03S': 'Signature mismatch',
  'M04': 'Data mismatch',
  'M05': 'Bad scan',
  'M06': 'Bad card print',
  'M07': 'Bad diecut',
  'M08': 'Bad lamination',
  'M09': 'Bad stock',
  'M10': 'Book number mismatch',
  'M11': 'Mrz not readable',
  'M201': 'Scan successful',
  'M202': 'Sent to printer',
  'M203': 'Under supervisor review',
  'M207': 'Good card quality',
  'MA': 'Card completed',
  'MA0': 'EAD signature card printed',
  'MA70': 'Biometrics received from ASC',
  'MA80': 'Card request sent to ICPS',
  'MA90': 'Bad/missing data in card request(e.g., address missing)',
  'MA91': 'Bad/missing data file during card production',
  'MA92': 'Bad/missing data in stream',
  'MA93': 'Duplicate receipt number in same prodreq.dat',
  'MA94': 'Duplicate application id received while card in production',
  'MA95': 'Unknown return address',
  'MA96': 'Ocr-b field missing(blank)',
  'MA97': 'Missing card media or card format in prodreq.dat',
  'MA98': 'Reserved for future ICPS use',
  'MA99': 'Reserved for future ICPS use',
  'MBA': 'Reentry permit produced',
  'MBB': 'Refugee travel document produced',
  'MBC': 'Advance parole document produced',
  'MCA': 'Naturalization certificate produced',
  'MCB': 'Citizenship certificate produced',
  'MCC': 'Repatriation certificate produced',
  'MCD': 'Declaration of intent produced',
  'MCE': 'Special certificate of naturalization produced',
  'MDA': 'Document pending destruction',
  'MDB': 'Document destroyed, did not meet specifications',
  'MEA': 'Document mailed to applicant',
  'MEBA': 'Document mailed to domestic office for distribution',
  'MEBB': 'Document mailed to overseas office or DOS for distribution',
  'MEC': 'Document personally given to applicant',
  'MFA': 'Document returned as undeliverable',
  'MFB': 'Document destroyed since undeliverable',
  'MFC': 'Document filed since undeliverable',
  'MGA': 'Re-entry permit voided',
  'MGB': 'Refugee travel document voided',
  'MI': 'Interim 13(d) EAD card produced off-system',
  'MO': 'EAD not produced since adjustment granted',
  'NA': 'OSC ordered',
  'NB': 'OSC produced',
  'NC': 'OSC served',
  'ND': 'OSC returned as undeliverable',
  'NE': 'OSC cancelled',
  'NF': 'Bond posted',
  'NG': 'Bond cancelled',
  'NHA': 'English proficiency demonstrated for natz. purposes',
  'NHB': 'Civics proficiency demonstrated for natz. purposes',
  'NHC': 'English and civics proficiency both demonstrated for natz. purp.',
  'NI': 'Intention to terminate status notice ordered',
  'NJA': 'Status termination notice ordered',
  'NJB': 'Status termination certification notice ordered',
  'NK': 'Automatic invitation to file for next step of staged benefit no',
  'OA': 'Appeal sustained',
  'OB': 'Appeal dismissed',
  'OC': 'Case remanded',
  'OD': 'Extension for brief granted',
  'OD0': 'Decision affirmed on appeal/cert.',
  'ODD0': 'Decision reversed on appeal/cert.',
  'OE': 'Extension for brief denied',
  'OF': 'Appeal terminated',
  'OG': 'Appeal withdrawn',
  'OH': 'Certified decision affirmed',
  'OHA': 'Certified approval affirmed',
  'OHB': 'Certified denial affirmed',
  'OI': 'Certified decision reversed',
  'OIA': 'Certified approval reversed/case denied',
  'OIB': 'Certified denial reversed/case approved',
  'PA': 'Case marked as premium processing',
  'PAA': 'Premium processing clock started',
  'PAAM': 'Premium processing clock started manually',
  'PAB': 'Premium processing clock stopped',
  'PABM': 'Premium processing clock stopped manually',
  'PAC': 'Premium processing clock date changed',
  'PB': 'Pre-certification marked',
  'PC': 'Pre-certification unmarked',
  'QAA': 'FBI name check result - no record (nr)',
  'QAB': 'FBI name check result - pending (ip)',
  'QAC': 'FBI name check result - error (e)',
  'QAD': 'FBI name check result - duplicate (d)',
  'QAE': 'FBI name check result - positive response (pr)',
  'QAF': 'FBI name check result - resubmit name check request (rs)',
  'RH': 'Applicant is code h',
  'RO': 'Applicant is code o',
  'TA': 'Pre-adjudicated - under review',
  'WK': 'Appeal filed',
  'WL': 'I-698 appeal filed'
};

var USCIS_CODE_SOURCE = 'NIEM scr:BenefitDocumentStatusCategoryCodeSimpleType';

// ---------------------------------------------------------------------------
// Stage classification (docs/design/04-evidence-stages.md)
//
// Maps a code to the STEP of a case it is activity for. The stage rail lights
// a step when a code here appears on the case; "lit" means USCIS logged
// activity at that step, never that the step completed — an interview can be
// scheduled (FJ) and then cancelled (FKB), and both are interview-step
// activity.
//
// Authored, not generated: every entry was placed by reading its NIEM
// description above (the description is the justification — grep the code).
// Codes deliberately absent: fee and payment accounting, holds, quality
// control, internal routing, and anything whose description does not plainly
// name a step. An absent code creates no stage and stays in the timeline.
//
// NIEM has NO oath/ceremony codes at all, so naturalization ceremonies cannot
// be evidenced from codes; if they ever surface it will be via status text or
// documents.
//
// Stage types: received, biometrics, evidence, interview, review, decision,
// card. (appointment exists as a stage type but is evidenced only by notices
// and documents, which carry dates — no code maps to it.)
var USCIS_CODE_STAGES = {
  // received — the filing arrived and was acknowledged
  'AALB': 'received',   // Received at the lockbox
  'ABA': 'received',    // Received, fee waived
  'ABB': 'received',    // Received - fee collected elsewhere
  'ACA': 'received',    // Received, fee in suspense
  'IAA': 'received',    // Receipt notice sent
  'IAAA': 'received',   // Receipt notice w/request for I-89 processing sent
  'IAB': 'received',    // Modified receipt notice 1 sent
  'IAC': 'received',    // Modified receipt notice 2 sent
  'IAD': 'received',    // Fee collected elsewhere receipt notice sent
  'IAF': 'received',    // Receipt letter emailed

  // biometrics — fingerprint/biometrics step
  'FN': 'biometrics',   // Fingerprint/agency checks ordered
  'FNA': 'biometrics',  // Fingerprint appointment notice ordered
  'FNB': 'biometrics',  // Fingerprints taken
  'FNG': 'biometrics',  // Fingerprint processing complete-ident
  'FNH': 'biometrics',  // Fingerprint processing complete-non-ident
  'IMAF': 'biometrics', // Fingerprint appointment notice sent
  'LIC': 'biometrics',  // Fingerprint not readable
  'LLIA': 'biometrics', // Fingerprint not readable
  'LN': 'biometrics',   // Fingerprint determined to be best available
  'MA70': 'biometrics', // Biometrics received from ASC

  // evidence — USCIS asked this person for something
  'FA': 'evidence',     // Case return for additional evidence notice ordered
  'FB0': 'evidence',    // Request evidence
  'FBA': 'evidence',    // Initial evidence request notice ordered
  'FBB': 'evidence',    // Additional evidence request notice ordered
  'FBC': 'evidence',    // Initial and additional evidence requested notice ordered
  'FC': 'evidence',     // Intent to revoke notice ordered
  'FCA0': 'evidence',   // Intent to revoke - fraud
  'FCB0': 'evidence',   // Intent to revoke - other
  'FE': 'evidence',     // Intent to deny notice ordered
  'II': 'evidence',     // Notice of intent to deny sent
  'IK': 'evidence',     // Request for additional evidence sent
  'IKE': 'evidence',    // Initial evidence requested via e-filing system
  'IKF': 'evidence',    // Initial evidence reminder emailed
  'IV': 'evidence',     // Notice of intent to revoke sent

  // interview — the whole lifecycle, including cancellations: a cancelled
  // interview is interview-step activity, and the timeline row says which
  'BC': 'interview',    // Relocated from sc to local office for standard interview
  'FH': 'interview',    // Place in interview que
  'FHA': 'interview',   // Schedule case for asylum interview
  'FHB': 'interview',   // Ready for interview scheduling
  'FI': 'interview',    // Force schedule interview
  'FJ': 'interview',    // Interview scheduled/notice ordered
  'FKB': 'interview',   // Cancel interview based on request
  'FL': 'interview',    // Failed to appear for interview or ADIT processing
  'FM': 'interview',    // Reschedule interview
  'FXA': 'interview',   // Terminate placement in interview que
  'HE': 'interview',    // Request to re-schedule interview received
  'HG': 'interview',    // Interview conducted
  'IM': 'interview',    // Interview notice sent
  'IXAA': 'interview',  // Interview cancellation by INS - notice sent
  'IXAB': 'interview',  // Interview cancellation per request - notice sent

  // review — officer/systems processing between receipt and decision
  'FSA0': 'review',     // Request database checks
  'FTA0': 'review',     // Database checks received
  'FT0': 'review',      // Officer processing begun

  // decision — a disposition, or the notice announcing one. Approvals,
  // denials, revocations, withdrawals and terminations all map here: the
  // stage says a decision exists, the timeline row says which. The rail never
  // colours by outcome (CONTRIBUTING.md, honesty rules).
  'DA': 'decision',     // Approved/notice ordered
  'DB': 'decision',     // Approved & certified/notice ordered
  'DC': 'decision',     // Approved in part/notice ordered
  'DD': 'decision',     // Approved in part & certified/notice ordered
  'DE': 'decision',     // Case ordered approved by AAO/notice ordered
  'DF': 'decision',     // Case ordered approved by EOIR/notice ordered
  'DG': 'decision',     // Case ordered approved by court/notice ordered
  'DH': 'decision',     // Approved on service motion/notice ordered
  'DI': 'decision',     // Approval reaffirmed after DOS return/notice ordered
  'EA': 'decision',     // Denial notice ordered
  'EB': 'decision',     // Denial & certification notice ordered
  'EC': 'decision',     // Denial notice with finding of fraud ordered
  'ED': 'decision',     // Denial & certification notice with finding of fraud ordered
  'EE': 'decision',     // Case ordered denied by AAO
  'EF': 'decision',     // Case ordered denied by EOIR
  'EGA': 'decision',    // Revocation notice ordered
  'EGB': 'decision',    // Revocation notice with finding of fraud ordered
  'EGC': 'decision',    // Revocation & certification notice ordered
  'EGD': 'decision',    // Revocation & certification notice w/finding of fraud ordered
  'EK': 'decision',     // Withdrawal acknowledgment notice ordered
  'EL': 'decision',     // Abandonment denial notice ordered
  'EM': 'decision',     // Automatic termination per oi 103.2(o) notice ordered
  'EN': 'decision',     // Case terminated; status acquired through other means
  'EO': 'decision',     // Visa denied by DOS
  'EP': 'decision',     // Petition terminated by DOS
  'EQ': 'decision',     // Petition revoked by DOS
  'IEA': 'decision',    // Approval notice sent
  'IEB': 'decision',    // Certification approval notice sent
  'IEE': 'decision',    // Approval letter emailed
  'IFA': 'decision',    // Denial notice sent
  'IFB': 'decision',    // Certification denial notice sent
  'IR': 'decision',     // Revocation notice sent
  'IT': 'decision',     // Withdrawal acknowledgment notice sent
  'IYB': 'decision',    // Status termination notice sent

  // card — production and delivery of the card or document
  'LAA': 'card',        // Card request sent to ICPS print server
  'LBA': 'card',        // Card order received at ICF
  'LDA': 'card',        // Card produced
  'LEA': 'card',        // Card mailed to applicant
  'LEB': 'card',        // Card mailed to amc
  'LEC': 'card',        // Card personally given to applicant
  'LFA': 'card',        // Card returned as undeliverable
  'MA': 'card',         // Card completed
  'MBB': 'card',        // Refugee travel document produced
  'MBC': 'card'         // Advance parole document produced
};

// Codes observed on live accounts that are absent from the NIEM schema. The
// schema is versioned federal data; USCIS's systems have moved past it, and
// these were learned only by seeing them on real cases. Every entry needs a
// provenance note. A test asserts USCIS_CODE_STAGES contains nothing outside
// USCIS_EVENT_CODES except this list.
var USCIS_OBSERVED_CODES = {
  'RCV0': 'received',   // observed 2026-08: appears at filing time; pairs with IAF
  'H001': 'received',   // observed 2026-08: appears alongside receipt events
  'H008': 'biometrics', // observed 2026-08: appears around ASC appointment handling
  'SA': 'decision',     // observed 2026-08: present when USCIS's own status text says approved
  'APR0': 'decision'    // observed 2026-08: pairs with approval status wording
};
for (var uscisObservedCode in USCIS_OBSERVED_CODES) {
  if (USCIS_OBSERVED_CODES.hasOwnProperty(uscisObservedCode)) {
    USCIS_CODE_STAGES[uscisObservedCode] = USCIS_OBSERVED_CODES[uscisObservedCode];
  }
}

// CaseLens — stylesheet
//
// Split out of the core file because it is 1,378 lines of CSS with no logic in
// it, and its bulk made the ~1,100 lines an auditor actually needs to read —
// the endpoints, the storage, the fetch layer — harder to find rather than
// easier. Concatenated ahead of the core by scripts/build.js; the file people
// install is still one file, and `node scripts/build.js --check` proves it.
//
// Every rule is scoped under .uscistr-root. Light and dark are both defined
// here; dark is the single class .uscistr-dark on that root.

var CASELENS_STYLE = [
  ".uscistr-root {",
  "  all: initial;",
  "  --ust-font: -apple-system, BlinkMacSystemFont, \"Segoe UI Variable Text\", \"Segoe UI\", system-ui, Roboto, \"Helvetica Neue\", Arial, sans-serif;",
  "  --ust-mono: ui-monospace, SFMono-Regular, \"SF Mono\", \"Cascadia Mono\", \"Segoe UI Mono\", Menlo, Consolas, \"Liberation Mono\", monospace;",
  // A serif for the status headline and card titles. This is the single
  // strongest signal that the panel is a record rather than a dashboard —
  // notices, letters and case files are set in serif, product chrome is not.
  // All faces below ship with the OS; nothing is fetched.
  "  --ust-serif: \"Iowan Old Style\", \"Palatino Linotype\", Palatino, \"Book Antiqua\", Georgia, \"Times New Roman\", serif;",
  // Five steps, each visibly different from its neighbours. There were seven,
  // two of them the same size (label and micro were both 10.5px) and two more
  // half a pixel apart (title 13px, heading 13.5px) — so 82% of the panel's
  // text landed in a 1px band and nothing looked more important than anything
  // else. Removing the duplicates and widening the bottom step is what makes
  // the hierarchy legible; no rule below had to change.
  "  --ust-fs-brand: 15px;      --ust-lh-brand: 1.2;",
  "  --ust-fs-lede: 17px;       --ust-lh-lede: 1.3;",
  "  --ust-fs-heading: 13.5px;  --ust-lh-heading: 1.35;",
  "  --ust-fs-body: 12.5px;     --ust-lh-body: 1.55;",
  "  --ust-fs-meta: 11.5px;     --ust-lh-meta: 1.45;",
  "  --ust-fs-mono: 12px;       --ust-lh-mono: 1.4;",
  "  --ust-fs-micro: 10px;      --ust-lh-micro: 1.4;",
  // Below the scale on purpose, and used only by the stage rail, which fits
  // five or six labels across a 400px panel. Named rather than left as a magic
  // number so it is obvious this is one exception, not a sixth step.
  "  --ust-fs-rail: 9.5px;      --ust-lh-rail: 1.2;",
  // Print-document scale: a printed record is read at arm's length on paper,
  // not in a 400px panel, so these steps are independent of the scale above.
  "  --ust-fs-doc-title: 20px;   --ust-lh-doc-title: 1.25;",
  "  --ust-fs-doc-head: 14px;    --ust-lh-doc-head: 1.3;",
  "  --ust-fs-doc-body: 12px;    --ust-lh-doc-body: 1.45;",
  "  --ust-fs-doc-meta: 9.5px;   --ust-lh-doc-meta: 1.35;",
  "  --ust-s1: 2px;  --ust-s2: 4px;  --ust-s3: 6px;  --ust-s4: 8px;  --ust-s5: 10px;",
  "  --ust-s6: 12px; --ust-s7: 16px; --ust-s8: 20px; --ust-s9: 24px; --ust-s10: 32px;",
  "  --ust-r-xs: 4px; --ust-r-sm: 6px; --ust-r-md: 8px;",
  "  --ust-r-lg: 8px; --ust-r-xl: 10px; --ust-r-full: 999px;",
  "  --ust-bg-panel: #FFFFFF;",
  "  --ust-bg-raised: rgba(255, 255, 255, 0.84);",
  "  --ust-bg-raised-solid: #FFFFFF;",
  "  --ust-bg-sunken: #F7F5F0;",
  "  --ust-bg-inset: #F1EEE7;",
  "  --ust-bg-hover: rgba(16, 19, 24, 0.045);",
  "  --ust-bg-active: rgba(16, 19, 24, 0.085);",
  "  --ust-tint-accent: rgba(79, 70, 229, 0.045);",
  "  --ust-text-1: #101318;",
  "  --ust-text-2: #3F4756;",
  "  --ust-text-3: #5F6776;",
  "  --ust-text-inv: #FFFFFF;",
  "  --ust-border-1: #E8EAEE;",
  "  --ust-border-2: #D8DCE3;",
  "  --ust-border-field: #868E9F;",
  "  --ust-accent: #1F5D5B;",
  "  --ust-accent-solid: #1F5D5B;",
  "  --ust-accent-solid-hover: #194B49;",
  "  --ust-accent-solid-active: #133A39;",
  "  --ust-accent-on: #FFFFFF;",
  "  --ust-accent-soft: #E7F0EE;",
  "  --ust-accent-soft-text: #174A48;",
  "  --ust-accent-soft-border: #C6DBD7;",
  "  --ust-success: #067647; --ust-success-soft: #E6F6EE; --ust-success-text: #05603A; --ust-success-border: #B3E2CB;",
  "  --ust-warn:    #B54708; --ust-warn-soft:    #FDF3E4; --ust-warn-text:    #93370D; --ust-warn-border:    #F0D9AE;",
  "  --ust-danger:  #B42318; --ust-danger-soft:  #FEEDEB; --ust-danger-text:  #912018; --ust-danger-border:  #F6CCC6;",
  "  --ust-info:    #175CD3; --ust-info-soft:    #EAF1FE; --ust-info-text:    #0B4A9E; --ust-info-border:    #C3D8F8;",
  "  --ust-track: #E7E9EF;",
  "  --ust-scroll-thumb: #C9CED8;",
  "  --ust-scroll-thumb-hover: #AEB5C2;",
  "  --ust-focus: #4F46E5;",
  "  --ust-focus-halo: rgba(79, 70, 229, 0.30);",
  "  --ust-sh-1: 0 1px 2px rgba(16, 24, 40, 0.06), 0 1px 1px rgba(16, 24, 40, 0.04);",
  "  --ust-sh-2: 0 2px 4px -1px rgba(16, 24, 40, 0.07), 0 4px 10px -2px rgba(16, 24, 40, 0.08);",
  "  --ust-sh-3: 0 1px 2px rgba(16, 24, 40, 0.06), 0 8px 16px -6px rgba(16, 24, 40, 0.12), 0 24px 48px -16px rgba(16, 24, 40, 0.20);",
  "  --ust-sh-pop: 0 2px 6px rgba(16, 24, 40, 0.08), 0 14px 30px -10px rgba(16, 24, 40, 0.22);",
  "  --ust-sh-inner: none;",
  "  --ust-d1: 90ms;  --ust-d2: 150ms; --ust-d3: 220ms; --ust-d4: 320ms;",
  "  --ust-ease: cubic-bezier(0.2, 0, 0, 1);",
  "  --ust-ease-out: cubic-bezier(0.05, 0.7, 0.1, 1);",
  "  --ust-ease-in: cubic-bezier(0.3, 0, 0.8, 0.15);",
  "  --ust-ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1);",
  "  color-scheme: light;",
  "  direction: ltr;",
  "  display: block;",
  "  position: fixed;",
  "  top: 0;",
  "  left: 0;",
  "  width: 0;",
  "  height: 0;",
  "  overflow: visible;",
  "  z-index: 2147483647;",
  "  pointer-events: none;",
  "  isolation: isolate;",
  "  font-family: var(--ust-font);",
  "  font-size: var(--ust-fs-body);",
  "  line-height: var(--ust-lh-body);",
  "  font-weight: 400;",
  "  color: var(--ust-text-1);",
  "  text-align: left;",
  "  -webkit-font-smoothing: antialiased;",
  "  -moz-osx-font-smoothing: grayscale;",
  "  text-rendering: optimizeLegibility;",
  "  font-variant-ligatures: none;",
  "}",
  ".uscistr-root.uscistr-dark {",
  "  color-scheme: dark;",
  "  --ust-bg-panel: #191A1F;",
  "  --ust-bg-raised: rgba(29, 30, 36, 0.84);",
  "  --ust-bg-raised-solid: #1D1E24;",
  "  --ust-bg-sunken: #131418;",
  "  --ust-bg-inset: #212329;",
  "  --ust-bg-hover: rgba(255, 255, 255, 0.055);",
  "  --ust-bg-active: rgba(255, 255, 255, 0.10);",
  "  --ust-tint-accent: rgba(139, 136, 247, 0.075);",
  "  --ust-text-1: #EBECF0;",
  "  --ust-text-2: #ADB2BF;",
  "  --ust-text-3: #8B92A1;",
  "  --ust-text-inv: #FFFFFF;",
  "  --ust-border-1: #2A2D35;",
  "  --ust-border-2: #3A3E49;",
  "  --ust-border-field: #666D7D;",
  "  --ust-accent: #7FC9C2;",
  "  --ust-accent-solid: #2C7A75;",
  "  --ust-accent-solid-hover: #359089;",
  "  --ust-accent-solid-active: #24635F;",
  "  --ust-accent-on: #FFFFFF;",
  "  --ust-accent-soft: #142B2A;",
  "  --ust-accent-soft-text: #9BD8D1;",
  "  --ust-accent-soft-border: #24504C;",
  "  --ust-success: #5FD3A0; --ust-success-soft: #14241E; --ust-success-text: #7FE3B5; --ust-success-border: #21493A;",
  "  --ust-warn:    #F5B860; --ust-warn-soft:    #26200F; --ust-warn-text:    #FAC97E; --ust-warn-border:    #4A3A18;",
  "  --ust-danger:  #FF9A90; --ust-danger-soft:  #271817; --ust-danger-text:  #FFA79E; --ust-danger-border:  #4E2A27;",
  "  --ust-info:    #8FBBF7; --ust-info-soft:    #141F2E; --ust-info-text:    #9CC4F8; --ust-info-border:    #23405E;",
  "  --ust-track: #2A2D35;",
  "  --ust-scroll-thumb: #3E434F;",
  "  --ust-scroll-thumb-hover: #545B6A;",
  "  --ust-focus: #8B88F7;",
  "  --ust-focus-halo: rgba(139, 136, 247, 0.34);",
  "  --ust-sh-1: 0 1px 2px rgba(0, 0, 0, 0.45);",
  "  --ust-sh-2: 0 2px 6px rgba(0, 0, 0, 0.5);",
  "  --ust-sh-3: 0 0 0 1px rgba(0, 0, 0, 0.55), 0 12px 28px -8px rgba(0, 0, 0, 0.7), 0 32px 64px -24px rgba(0, 0, 0, 0.65);",
  "  --ust-sh-pop: 0 0 0 1px rgba(0, 0, 0, 0.5), 0 14px 30px -10px rgba(0, 0, 0, 0.7);",
  "  --ust-sh-inner: inset 0 1px 0 rgba(255, 255, 255, 0.055);",
  "}",
  ".uscistr-root *,",
  ".uscistr-root *::before,",
  ".uscistr-root *::after {",
  "  box-sizing: border-box;",
  "  margin: 0;",
  "  padding: 0;",
  "  border: 0 solid transparent;",
  "  border-radius: 0;",
  "  background: none;",
  "  background-color: transparent;",
  "  font: inherit;",
  "  font-family: inherit;",
  "  font-size: inherit;",
  "  font-weight: inherit;",
  "  font-style: normal;",
  "  font-variant: normal;",
  "  line-height: inherit;",
  "  color: inherit;",
  "  letter-spacing: normal;",
  "  word-spacing: normal;",
  "  text-align: inherit;",
  "  text-decoration: none;",
  "  text-indent: 0;",
  "  text-shadow: none;",
  "  text-transform: none;",
  "  white-space: normal;",
  "  vertical-align: baseline;",
  "  list-style: none;",
  "  float: none;",
  "  clear: none;",
  "  position: static;",
  "  inset: auto;",
  "  box-shadow: none;",
  "  outline: none;",
  "  opacity: 1;",
  "  visibility: visible;",
  "  transform: none;",
  "  filter: none;",
  "  animation: none;",
  "  transition: none;",
  "  mix-blend-mode: normal;",
  "  clip-path: none;",
  "  pointer-events: auto;",
  "  cursor: inherit;",
  "  -webkit-appearance: none;",
  "  appearance: none;",
  "  -webkit-tap-highlight-color: transparent;",
  "}",
  ".uscistr-root *:not(svg):not(svg *),",
  ".uscistr-root *::before,",
  ".uscistr-root *::after {",
  "  width: auto;",
  "  height: auto;",
  "  min-width: 0;",
  "  min-height: 0;",
  "  max-width: none;",
  "  max-height: none;",
  "}",
  ".uscistr-root svg { display: block; overflow: visible; }",
  ".uscistr-root svg * { fill: none; stroke: none; }",
  ".uscistr-root .uscistr-ico {",
  "  display: block;",
  "  fill: none;",
  "  stroke: currentColor;",
  "  stroke-width: 1.6;",
  "  stroke-linecap: round;",
  "  stroke-linejoin: round;",
  "}",
  ".uscistr-root .uscistr-ico * { fill: none; stroke: currentColor; }",
  ".uscistr-root :focus { outline: none; }",
  ".uscistr-root .uscistr-btn:focus-visible,",
  ".uscistr-root .uscistr-icon-btn:focus-visible,",
  ".uscistr-root .uscistr-input:focus-visible,",
  ".uscistr-root .uscistr-select:focus-visible,",
  ".uscistr-root .uscistr-switch:focus-visible,",
  ".uscistr-root .uscistr-pill:focus-visible,",
  ".uscistr-root .uscistr-raw-summary:focus-visible,",
  // Everything below was focusable with no visible focus ring, because the
  // root sets `:focus { outline: none }` and restores it only for this list.
  // The case rows are the primary control in the whole panel — a keyboard user
  // tabbing through them saw nothing move. `uscistr-raw-toggle` is also a
  // rename that left its old selector (`raw-summary`, above) behind.
  ".uscistr-root .uscistr-collapsed:focus-visible,",
  ".uscistr-root .uscistr-raw-toggle:focus-visible,",
  ".uscistr-root .uscistr-more:focus-visible,",
  ".uscistr-root .uscistr-add-toggle:focus-visible,",
  ".uscistr-root .uscistr-row-toggle:focus-visible,",
  ".uscistr-root .uscistr-receipt:focus-visible,",
  ".uscistr-root .uscistr-link:focus-visible {",
  "  outline: 2px solid var(--ust-focus);",
  "  outline-offset: 2px;",
  "  box-shadow: 0 0 0 4px var(--ust-focus-halo);",
  "}",
  "@media (forced-colors: active) {",
  "  .uscistr-root .uscistr-panel,",
  "  .uscistr-root .uscistr-pill,",
  "  .uscistr-root .uscistr-card,",
  "  .uscistr-root .uscistr-chip { border: 1px solid CanvasText; }",
  "  .uscistr-root .uscistr-btn:focus-visible,",
  "  .uscistr-root .uscistr-icon-btn:focus-visible { outline: 3px solid Highlight; }",
  "}",
  ".uscistr-root .uscistr-pill {",
  "  position: fixed;",
  "  right: 20px;",
  "  bottom: 20px;",
  "  pointer-events: auto;",
  "  display: inline-flex;",
  "  align-items: center;",
  "  gap: var(--ust-s3);",
  "  height: 36px;",
  "  padding: 0 var(--ust-s5) 0 var(--ust-s4);",
  "  border: 1px solid var(--ust-border-2);",
  "  border-radius: var(--ust-r-full);",
  "  background: var(--ust-bg-panel);",
  "  color: var(--ust-text-1);",
  "  font-family: var(--ust-font);",
  "  font-size: var(--ust-fs-heading);",
  "  font-weight: 560;",
  "  line-height: 1;",
  "  letter-spacing: -0.005em;",
  "  box-shadow: var(--ust-sh-2), var(--ust-sh-inner);",
  "  cursor: pointer;",
  "  transition: transform var(--ust-d1) var(--ust-ease),",
  "              box-shadow var(--ust-d2) var(--ust-ease),",
  "              background-color var(--ust-d1) var(--ust-ease),",
  "              border-color var(--ust-d1) var(--ust-ease);",
  "}",
  ".uscistr-root .uscistr-pill:hover {",
  "  background: var(--ust-bg-panel);",
  "  border-color: var(--ust-border-field);",
  "  box-shadow: var(--ust-sh-3), var(--ust-sh-inner);",
  "  transform: translateY(-1px);",
  "}",
  ".uscistr-root .uscistr-pill:active { transform: translateY(0) scale(0.985); box-shadow: var(--ust-sh-1); }",
  ".uscistr-root .uscistr-pill-label { white-space: nowrap; }",
  ".uscistr-root .uscistr-pill-count {",
  "  display: inline-flex;",
  "  align-items: center;",
  "  justify-content: center;",
  "  min-width: 18px;",
  "  height: 18px;",
  "  padding: 0 5px;",
  "  border-radius: var(--ust-r-full);",
  "  background: var(--ust-bg-inset);",
  "  color: var(--ust-text-2);",
  "  font-family: var(--ust-mono);",
  "  font-size: var(--ust-fs-micro);",
  "  font-weight: 600;",
  "  font-variant-numeric: tabular-nums;",
  "  line-height: 1;",
  "}",
  ".uscistr-root .uscistr-pill-dot {",
  "  position: relative;",
  "  width: 7px;",
  "  height: 7px;",
  "  border-radius: var(--ust-r-full);",
  "  background: var(--ust-accent-solid);",
  "  flex: none;",
  "}",
  ".uscistr-root .uscistr-pill-dot::after {",
  "  content: \"\";",
  "  position: absolute;",
  "  inset: -3px;",
  "  border-radius: var(--ust-r-full);",
  "  border: 1px solid var(--ust-accent-solid);",
  "  opacity: 0;",
  "  animation: ust-ping 2.4s var(--ust-ease-out) infinite;",
  "}",
  ".uscistr-root .uscistr-pill-mark { width: 18px; height: 18px; flex: none; }",
  ".uscistr-root .uscistr-panel {",
  "  position: fixed;",
  "  right: 20px;",
  "  bottom: 20px;",
  "  pointer-events: auto;",
  "  display: flex;",
  "  flex-direction: column;",
  "  width: 400px;",
  "  max-width: calc(100vw - 24px);",
  "  max-height: 85vh;",
  "  border: 1px solid var(--ust-border-2);",
  "  border-radius: var(--ust-r-xl);",
  "  background: var(--ust-bg-panel);",
  "  color: var(--ust-text-1);",
  "  box-shadow: var(--ust-sh-3);",
  "  overflow: hidden;",
  // Width is the only thing that changes between the two layouts, so it can be
  // transitioned. Height is left alone: animating it would fight the panel's
  // own scrolling while content is still loading.
  "  transition: width var(--ust-d3) var(--ust-ease-out);",
  "}",
  // Only when the panel first appears. It used to be unconditional on the
  // element, and render() rebuilds that element — so a background refresh
  // restarted the entry animation under someone mid-read.
  ".uscistr-root .uscistr-panel-enter { animation: ust-panel-in var(--ust-d4) var(--ust-ease-out) both; }",
  // Reading a case: wide enough that the record is legible without the list
  // being evicted to make room for it.
  ".uscistr-root .uscistr-panel.uscistr-is-wide {",
  "  width: min(720px, calc(100vw - 40px));",
  "  max-height: 92vh;",
  "}",
  ".uscistr-root .uscistr-notices { flex: none; }",
  // Shown once. Solid rather than dashed: this one is an introduction, not a
  // caveat about missing data like the other note boxes.
  ".uscistr-root .uscistr-intro {",
  "  border-style: solid;",
  "  border-color: var(--ust-accent-soft-border);",
  "  background: var(--ust-accent-soft);",
  "  gap: var(--ust-s3);",
  "}",
  ".uscistr-root .uscistr-intro button { align-self: flex-start; margin-top: var(--ust-s2); }",
  // Two independently scrolling columns. The rail keeps its own scroll so a
  // long case never scrolls the overview away.
  ".uscistr-root .uscistr-body-split {",
  "  display: grid;",
  "  grid-template-columns: 248px minmax(0, 1fr);",
  "  overflow: hidden;",
  "  padding: 0;",
  "}",
  ".uscistr-root .uscistr-rail {",
  "  display: flex;",
  "  flex-direction: column;",
  "  min-height: 0;",
  "  overflow-y: auto;",
  "  border-right: 1px solid var(--ust-border-1);",
  "  background: var(--ust-bg-inset);",
  "}",
  ".uscistr-root .uscistr-rail-list { display: flex; flex-direction: column; }",
  // Two classes on purpose: the row is a .uscistr-collapsed button, whose
  // base rule sets border-radius LATER in this sheet. A single-class
  // override here has equal specificity and loses to source order, so the
  // rounding quietly survived — and the open row's inset accent bar follows
  // the element's radius, drawing a curved accent inside the rail's straight
  // edge.
  ".uscistr-root .uscistr-collapsed.uscistr-rail-row {",
  "  border-bottom: 1px solid var(--ust-border-1);",
  "  border-radius: 0;",
  "}",
  // The deadline line wraps rather than truncating. It is the one line on a
  // row that must survive intact — at rail width, ellipsising it dropped the
  // "in 10 days" that makes a date read as a deadline.
  ".uscistr-root .uscistr-rail-row .uscistr-collapsed-demand {",
  "  align-items: flex-start;",
  "}",
  ".uscistr-root .uscistr-rail-row .uscistr-collapsed-demand .uscistr-truncate {",
  "  white-space: normal;",
  "  overflow: visible;",
  "  text-overflow: clip;",
  "}",
  ".uscistr-root .uscistr-rail-row .uscistr-collapsed-demand-dot { margin-top: 5px; }",
  // The open case is marked on its left edge rather than by a fill, so the
  // change and deadline colours on the row still mean what they mean.
  ".uscistr-root .uscistr-rail-row-open {",
  "  background: var(--ust-bg-panel);",
  "  box-shadow: inset 3px 0 0 var(--ust-accent-solid);",
  "}",
  ".uscistr-root .uscistr-detail {",
  "  min-width: 0;",
  "  min-height: 0;",
  "  overflow-y: auto;",
  "  padding: var(--ust-s5) var(--ust-s5) var(--ust-s6);",
  "}",
  ".uscistr-root .uscistr-panel.uscistr-is-dragging {",
  "  box-shadow: var(--ust-sh-3), 0 0 0 1px var(--ust-accent-soft-border);",
  "  cursor: grabbing;",
  "  user-select: none;",
  "}",
  ".uscistr-root .uscistr-header {",
  "  position: sticky;",
  "  top: 0;",
  "  z-index: 3;",
  "  flex: none;",
  "  display: grid;",
  "  grid-template-columns: auto 1fr auto;",
  "  align-items: center;",
  "  gap: var(--ust-s4);",
  "  height: 46px;",
  "  padding: 0 var(--ust-s3) 0 var(--ust-s6);",
  "  background: var(--ust-bg-raised);",
  "  -webkit-backdrop-filter: blur(14px) saturate(180%);",
  "  backdrop-filter: blur(14px) saturate(180%);",
  "  box-shadow: inset 0 -1px 0 var(--ust-border-1);",
  "  cursor: grab;",
  "  user-select: none;",
  "}",
  ".uscistr-root .uscistr-header:active { cursor: grabbing; }",
  ".uscistr-root .uscistr-brand { display: flex; align-items: center; gap: var(--ust-s3); min-width: 0; }",
  ".uscistr-root .uscistr-brand-name { font-family: var(--ust-serif); font-size: var(--ust-fs-brand); letter-spacing: 0.005em; }",
  ".uscistr-root .uscistr-mark {",
  "  width: 22px; height: 22px; flex: none;",
  "  border-radius: var(--ust-r-sm);",
  "  box-shadow: var(--ust-sh-1);",
  "}",
  ".uscistr-root .uscistr-titles { display: flex; flex-direction: column; gap: 1px; min-width: 0; }",
  ".uscistr-root .uscistr-title {",
  "  font-size: var(--ust-fs-heading);",
  "  line-height: var(--ust-lh-heading);",
  "  font-weight: 600;",
  "  letter-spacing: -0.008em;",
  "  color: var(--ust-text-1);",
  "  white-space: nowrap;",
  "  overflow: hidden;",
  "  text-overflow: ellipsis;",
  "}",
  ".uscistr-root .uscistr-subtitle {",
  "  font-size: var(--ust-fs-micro);",
  "  line-height: 1.2;",
  "  color: var(--ust-text-3);",
  "  font-variant-numeric: tabular-nums;",
  "  white-space: nowrap;",
  "}",
  // The two counts that carry consequence get weight and ink; the rest of the
  // line stays quiet. "2 with something new" and "nothing new" were previously
  // identical in size, weight and colour — the one distinction this line exists
  // to draw was the one it did not make.
  ".uscistr-root .uscistr-subtitle-changed { color: var(--ust-accent); font-weight: 600; }",
  ".uscistr-root .uscistr-subtitle-demand { color: var(--ust-warn-text); font-weight: 600; }",
  ".uscistr-root .uscistr-subtitle-sep { opacity: 0.55; }",
  ".uscistr-root .uscistr-header-actions { display: flex; align-items: center; gap: var(--ust-s1); }",
  ".uscistr-root .uscistr-body {",
  "  flex: 1 1 auto;",
  "  min-height: 0;",
  "  overflow-y: auto;",
  "  overflow-x: hidden;",
  "  overscroll-behavior: contain;",
  "  scrollbar-width: thin;",
  "  scrollbar-color: var(--ust-scroll-thumb) transparent;",
  "}",
  ".uscistr-root .uscistr-body::-webkit-scrollbar { width: 11px; height: 11px; }",
  ".uscistr-root .uscistr-body::-webkit-scrollbar-track { background: transparent; }",
  ".uscistr-root .uscistr-body::-webkit-scrollbar-thumb {",
  "  background-color: var(--ust-scroll-thumb);",
  "  border: 3px solid transparent;",
  "  background-clip: padding-box;",
  "  border-radius: var(--ust-r-full);",
  "}",
  ".uscistr-root .uscistr-body::-webkit-scrollbar-thumb:hover { background-color: var(--ust-scroll-thumb-hover); }",
  ".uscistr-root .uscistr-footer {",
  "  flex: none;",
  "  display: flex;",
  "  align-items: center;",
  "  justify-content: space-between;",
  "  gap: var(--ust-s4);",
  "  height: 34px;",
  "  padding: 0 var(--ust-s6);",
  "  background: var(--ust-bg-raised);",
  "  -webkit-backdrop-filter: blur(14px) saturate(180%);",
  "  backdrop-filter: blur(14px) saturate(180%);",
  "  box-shadow: inset 0 1px 0 var(--ust-border-1);",
  "  font-size: var(--ust-fs-micro);",
  "  line-height: 1.2;",
  "  color: var(--ust-text-3);",
  "  font-variant-numeric: tabular-nums;",
  "}",
  ".uscistr-root .uscistr-footer-left,",
  ".uscistr-root .uscistr-footer-right { display: flex; align-items: center; gap: var(--ust-s3); min-width: 0; }",
  ".uscistr-root .uscistr-footer-sep { color: var(--ust-border-2); }",
  ".uscistr-root .uscistr-footer svg { width: 12px; height: 12px; color: var(--ust-text-3); }",
  ".uscistr-root .uscistr-btn {",
  "  display: inline-flex;",
  "  align-items: center;",
  "  justify-content: center;",
  "  gap: var(--ust-s3);",
  "  height: 28px;",
  "  padding: 0 var(--ust-s5);",
  "  border: 1px solid transparent;",
  "  border-radius: var(--ust-r-md);",
  "  background: transparent;",
  "  color: var(--ust-text-2);",
  "  font-family: var(--ust-font);",
  "  font-size: var(--ust-fs-mono);",
  "  font-weight: 560;",
  "  line-height: 1;",
  "  letter-spacing: -0.003em;",
  "  white-space: nowrap;",
  "  cursor: pointer;",
  "  transition: background-color var(--ust-d1) var(--ust-ease),",
  "              color var(--ust-d1) var(--ust-ease),",
  "              border-color var(--ust-d1) var(--ust-ease),",
  "              box-shadow var(--ust-d1) var(--ust-ease),",
  "              transform var(--ust-d1) var(--ust-ease);",
  "}",
  ".uscistr-root .uscistr-btn svg { width: 14px; height: 14px; flex: none; }",
  ".uscistr-root .uscistr-btn:active { transform: translateY(0.5px); }",
  ".uscistr-root .uscistr-btn:disabled,",
  ".uscistr-root .uscistr-btn[aria-disabled=\"true\"] {",
  "  opacity: 0.42;",
  "  cursor: not-allowed;",
  "  transform: none;",
  "  pointer-events: none;",
  "}",
  ".uscistr-root .uscistr-btn-sm { height: 24px; padding: 0 var(--ust-s4); font-size: var(--ust-fs-meta); border-radius: var(--ust-r-sm); }",
  ".uscistr-root .uscistr-btn-sm svg { width: 12px; height: 12px; }",
  ".uscistr-root .uscistr-btn-primary {",
  "  background: var(--ust-accent-solid);",
  "  border-color: transparent;",
  "  color: var(--ust-accent-on);",
  "  box-shadow: var(--ust-sh-1);",
  "  font-weight: 600;",
  "}",
  ".uscistr-root .uscistr-btn-primary:hover { background: var(--ust-accent-solid-hover); box-shadow: var(--ust-sh-2); }",
  ".uscistr-root .uscistr-btn-primary:active { background: var(--ust-accent-solid-active); box-shadow: none; }",
  ".uscistr-root .uscistr-btn-outline {",
  "  background: var(--ust-bg-panel);",
  "  border-color: var(--ust-border-2);",
  "  color: var(--ust-text-1);",
  "  box-shadow: var(--ust-sh-1);",
  "}",
  ".uscistr-root .uscistr-btn-outline:hover { background: var(--ust-bg-sunken); border-color: var(--ust-border-field); }",
  ".uscistr-root .uscistr-btn-outline:active { background: var(--ust-bg-inset); box-shadow: none; }",
  ".uscistr-root .uscistr-btn-ghost { background: transparent; border-color: transparent; color: var(--ust-text-2); }",
  ".uscistr-root .uscistr-btn-ghost:hover { background: var(--ust-bg-hover); color: var(--ust-text-1); }",
  ".uscistr-root .uscistr-btn-ghost:active { background: var(--ust-bg-active); }",
  ".uscistr-root .uscistr-btn-danger {",
  "  background: transparent;",
  "  border-color: transparent;",
  "  color: var(--ust-danger-text);",
  "}",
  ".uscistr-root .uscistr-btn-danger:hover { background: var(--ust-danger-soft); border-color: var(--ust-danger-border); }",
  ".uscistr-root .uscistr-btn-danger:active { background: var(--ust-danger); border-color: transparent; color: #FFFFFF; }",
  ".uscistr-root.uscistr-dark .uscistr-btn-danger:active { color: #1A0F0E; }",
  ".uscistr-root .uscistr-icon-btn {",
  "  display: inline-flex;",
  "  align-items: center;",
  "  justify-content: center;",
  "  width: 28px;",
  "  height: 28px;",
  "  border: 1px solid transparent;",
  "  border-radius: var(--ust-r-md);",
  "  background: transparent;",
  "  color: var(--ust-text-3);",
  "  cursor: pointer;",
  "  transition: background-color var(--ust-d1) var(--ust-ease), color var(--ust-d1) var(--ust-ease);",
  "}",
  ".uscistr-root .uscistr-icon-btn svg { width: 15px; height: 15px; }",
  ".uscistr-root .uscistr-icon-btn:hover { background: var(--ust-bg-hover); color: var(--ust-text-1); }",
  ".uscistr-root .uscistr-icon-btn:active { background: var(--ust-bg-active); }",
  ".uscistr-root .uscistr-icon-btn.uscistr-is-on { background: var(--ust-accent-soft); color: var(--ust-accent-soft-text); }",
  ".uscistr-root .uscistr-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; pointer-events: none; }",
  ".uscistr-root .uscistr-icon-btn.uscistr-is-busy svg { animation: ust-spin 900ms linear infinite; }",
  ".uscistr-root .uscistr-input,",
  ".uscistr-root .uscistr-select {",
  "  display: block;",
  "  width: 100%;",
  "  height: 30px;",
  "  padding: 0 var(--ust-s4);",
  "  border: 1px solid var(--ust-border-field);",
  "  border-radius: var(--ust-r-md);",
  "  background: var(--ust-bg-panel);",
  "  color: var(--ust-text-1);",
  "  font-family: var(--ust-font);",
  "  font-size: var(--ust-fs-body);",
  "  line-height: 28px;",
  "  transition: border-color var(--ust-d1) var(--ust-ease), box-shadow var(--ust-d1) var(--ust-ease), background-color var(--ust-d1) var(--ust-ease);",
  "}",
  ".uscistr-root .uscistr-input::placeholder { color: var(--ust-text-3); opacity: 1; }",
  ".uscistr-root .uscistr-input:hover,",
  ".uscistr-root .uscistr-select:hover { border-color: var(--ust-text-3); }",
  ".uscistr-root .uscistr-input:focus-visible,",
  ".uscistr-root .uscistr-select:focus-visible { border-color: var(--ust-accent); outline-offset: 1px; }",
  ".uscistr-root .uscistr-input:disabled { background: var(--ust-bg-inset); color: var(--ust-text-3); cursor: not-allowed; }",
  ".uscistr-root .uscistr-input.uscistr-is-invalid { border-color: var(--ust-danger); }",
  ".uscistr-root .uscistr-input.uscistr-mono { font-family: var(--ust-mono); font-size: var(--ust-fs-mono); letter-spacing: 0.04em; text-transform: uppercase; }",
  ".uscistr-root .uscistr-select {",
  "  padding-right: 26px;",
  "  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%);",
  "  background-position: calc(100% - 14px) 13px, calc(100% - 9px) 13px;",
  "  background-size: 5px 5px, 5px 5px;",
  "  background-repeat: no-repeat;",
  "  cursor: pointer;",
  "}",
  ".uscistr-root .uscistr-field-error { font-size: var(--ust-fs-micro); line-height: 1.4; color: var(--ust-danger-text); }",
  ".uscistr-root .uscistr-add-form {",
  "  display: grid;",
  "  grid-template-columns: 1.15fr 1fr auto;",
  "  gap: var(--ust-s3);",
  "  align-items: center;",
  "  padding: var(--ust-s5) var(--ust-s6);",
  "  background: var(--ust-bg-sunken);",
  "  box-shadow: inset 0 -1px 0 var(--ust-border-1);",
  "}",
  ".uscistr-root .uscistr-switch {",
  "  position: relative;",
  "  flex: none;",
  "  width: 32px;",
  "  height: 19px;",
  "  border: 1px solid var(--ust-border-field);",
  "  border-radius: var(--ust-r-full);",
  "  background: var(--ust-bg-inset);",
  "  cursor: pointer;",
  "  transition: background-color var(--ust-d2) var(--ust-ease), border-color var(--ust-d2) var(--ust-ease);",
  "}",
  ".uscistr-root .uscistr-switch::after {",
  "  content: \"\";",
  "  position: absolute;",
  "  top: 2px;",
  "  left: 2px;",
  "  width: 13px;",
  "  height: 13px;",
  "  border-radius: var(--ust-r-full);",
  "  background: var(--ust-bg-panel);",
  "  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.35);",
  "  transition: transform var(--ust-d2) var(--ust-ease-spring);",
  "}",
  ".uscistr-root .uscistr-switch[aria-checked=\"true\"] { background: var(--ust-accent-solid); border-color: var(--ust-accent-solid); }",
  ".uscistr-root .uscistr-switch[aria-checked=\"true\"]::after { transform: translateX(13px); background: #FFFFFF; }",
  ".uscistr-root .uscistr-switch:disabled { opacity: 0.45; cursor: not-allowed; }",
  ".uscistr-root .uscistr-chip {",
  "  display: inline-flex;",
  "  align-items: center;",
  "  gap: var(--ust-s2);",
  "  height: 20px;",
  "  padding: 0 var(--ust-s3);",
  "  border: 1px solid transparent;",
  "  border-radius: var(--ust-r-sm);",
  "  background: var(--ust-bg-inset);",
  "  color: var(--ust-text-2);",
  "  font-size: var(--ust-fs-micro);",
  "  font-weight: 600;",
  "  line-height: 1;",
  "  letter-spacing: 0.005em;",
  "  white-space: nowrap;",
  "  flex: none;",
  "}",
  ".uscistr-root .uscistr-chip svg { width: 11px; height: 11px; }",
  ".uscistr-root .uscistr-chip-dot { width: 6px; height: 6px; border-radius: var(--ust-r-full); background: currentColor; flex: none; }",
  ".uscistr-root .uscistr-chip-success { background: var(--ust-success-soft); border-color: var(--ust-success-border); color: var(--ust-success-text); }",
  ".uscistr-root .uscistr-chip-warn    { background: var(--ust-warn-soft);    border-color: var(--ust-warn-border);    color: var(--ust-warn-text); }",
  ".uscistr-root .uscistr-chip-danger  { background: var(--ust-danger-soft);  border-color: var(--ust-danger-border);  color: var(--ust-danger-text); }",
  ".uscistr-root .uscistr-chip-info    { background: var(--ust-info-soft);    border-color: var(--ust-info-border);    color: var(--ust-info-text); }",
  ".uscistr-root .uscistr-chip-accent  { background: var(--ust-accent-soft);  border-color: var(--ust-accent-soft-border); color: var(--ust-accent-soft-text); }",
  ".uscistr-root .uscistr-chip-neutral { background: var(--ust-bg-inset); border-color: var(--ust-border-1); color: var(--ust-text-2); }",
  ".uscistr-root .uscistr-chip-quiet   { background: transparent; border-color: var(--ust-border-2); color: var(--ust-text-3); }",
  ".uscistr-root .uscistr-chip-form {",
  "  font-family: var(--ust-mono);",
  "  font-size: var(--ust-fs-meta);",
  "  font-weight: 600;",
  "  letter-spacing: 0.02em;",
  "  font-variant-numeric: tabular-nums;",
  "  background: var(--ust-bg-inset);",
  "  border-color: var(--ust-border-1);",
  "  color: var(--ust-text-1);",
  "}",
  ".uscistr-root .uscistr-code {",
  "  display: inline-flex;",
  "  align-items: center;",
  "  height: 16px;",
  "  padding: 0 var(--ust-s2);",
  "  border: 1px solid var(--ust-border-1);",
  "  border-radius: var(--ust-r-xs);",
  "  background: var(--ust-bg-inset);",
  "  color: var(--ust-text-3);",
  "  font-family: var(--ust-mono);",
  "  font-size: var(--ust-fs-rail);",
  "  font-weight: 600;",
  "  letter-spacing: 0.04em;",
  "  line-height: 1;",
  "  flex: none;",
  "}",
  ".uscistr-root .uscistr-banner {",
  "  display: grid;",
  "  grid-template-columns: auto 1fr auto;",
  "  align-items: start;",
  "  gap: var(--ust-s4);",
  "  margin: var(--ust-s5) var(--ust-s6) 0;",
  "  padding: var(--ust-s5);",
  "  border: 1px solid var(--ust-warn-border);",
  "  border-radius: var(--ust-r-lg);",
  "  background: var(--ust-warn-soft);",
  "  color: var(--ust-warn-text);",
  "}",
  ".uscistr-root .uscistr-banner svg { width: 15px; height: 15px; margin-top: 1px; flex: none; }",
  ".uscistr-root .uscistr-banner-body { display: flex; flex-direction: column; gap: var(--ust-s2); min-width: 0; }",
  ".uscistr-root .uscistr-banner-title { font-size: var(--ust-fs-mono); font-weight: 600; line-height: 1.35; }",
  ".uscistr-root .uscistr-banner-text { font-size: var(--ust-fs-meta); line-height: 1.45; color: var(--ust-warn-text); opacity: 0.92; }",
  ".uscistr-root .uscistr-banner-actions { display: flex; align-items: center; gap: var(--ust-s2); }",
  ".uscistr-root .uscistr-banner-danger { border-color: var(--ust-danger-border); background: var(--ust-danger-soft); color: var(--ust-danger-text); }",
  ".uscistr-root .uscistr-banner-danger .uscistr-banner-text { color: var(--ust-danger-text); }",
  ".uscistr-root .uscistr-banner-info { border-color: var(--ust-info-border); background: var(--ust-info-soft); color: var(--ust-info-text); }",
  ".uscistr-root .uscistr-banner-info .uscistr-banner-text { color: var(--ust-info-text); }",
  ".uscistr-root .uscistr-banner .uscistr-btn-sm {",
  "  border-color: currentColor;",
  "  color: inherit;",
  "  background: transparent;",
  "  box-shadow: none;",
  "  opacity: 0.95;",
  "}",
  ".uscistr-root .uscistr-banner .uscistr-btn-sm:hover { background: rgba(0, 0, 0, 0.06); }",
  ".uscistr-root.uscistr-dark .uscistr-banner .uscistr-btn-sm:hover { background: rgba(255, 255, 255, 0.08); }",
  ".uscistr-root .uscistr-case-list { display: block; }",
  ".uscistr-root .uscistr-collapsed {",
  "  display: flex; flex-direction: column; gap: 3px;",
  "  width: 100%; text-align: left; cursor: pointer;",
  "  background: none; border: 0; padding: var(--ust-s4) var(--ust-s5);",
  "  font: inherit; color: inherit; border-radius: var(--ust-r-md);",
  "}",
  ".uscistr-root .uscistr-collapsed:hover { background: var(--ust-bg-hover); }",
  ".uscistr-root .uscistr-collapsed-head { display: flex; align-items: center; gap: var(--ust-s3); min-width: 0; }",
  ".uscistr-root .uscistr-collapsed-dot {",
  "  width: 7px; height: 7px; flex: none; border-radius: var(--ust-r-full);",
  "  background: var(--ust-accent-solid);",
  "}",
  ".uscistr-root .uscistr-collapsed-name { font-weight: 600; font-size: var(--ust-fs-heading); min-width: 0; }",
  ".uscistr-root .uscistr-collapsed-body {",
  "  display: flex; align-items: baseline; gap: var(--ust-s3);",
  "  min-width: 0; padding-left: calc(7px + var(--ust-s3));",
  "}",
  ".uscistr-root .uscistr-collapsed-status { font-size: var(--ust-fs-meta); color: var(--ust-text-2); min-width: 0; flex: 1 1 auto; }",
  ".uscistr-root .uscistr-collapsed-age { font-size: var(--ust-fs-micro); color: var(--ust-text-3); flex: none; }",
    // Day N sits at the right of the identity line: a number that moves daily,
    // kept deliberately quiet so it never competes with the status.
    ".uscistr-root .uscistr-collapsed-day {",
    "  margin-left: auto; flex: none;",
    "  font-size: var(--ust-fs-micro); color: var(--ust-text-3);",
    "  font-variant-numeric: tabular-nums;",
    "}",
    // The only line on a collapsed row allowed to raise its voice, because it
    // is the only content that can be time-critical.
    ".uscistr-root .uscistr-collapsed-demand {",
    "  display: flex; align-items: center; gap: var(--ust-s3);",
    "  margin-top: 3px; padding-left: calc(7px + var(--ust-s3));",
    "  font-size: var(--ust-fs-micro); font-weight: 600;",
    "  color: var(--ust-warn-text);",
    "}",
    ".uscistr-root .uscistr-collapsed-demand-dot {",
    "  width: 5px; height: 5px; flex: none; border-radius: var(--ust-r-full);",
    "  background: var(--ust-warn);",
    "}",
    // A concluded case stops counting. Quieter still than Day N, because it is
    // the one number on the row that will never change again.
    ".uscistr-root .uscistr-collapsed-day-closed {",
    "  font-variant-numeric: normal; letter-spacing: 0.02em;",
    "}",
    // A row drawn from a stored copy is otherwise identical to a fresh one.
    ".uscistr-root .uscistr-collapsed-stale {",
    "  margin-top: 3px; padding-left: calc(7px + var(--ust-s3));",
    "  font-size: var(--ust-fs-micro); color: var(--ust-text-3);",
    "}",
    // Position and place — the stage map's newest fact and USCIS's own
    // jurisdiction string. Quieter than the status line: it answers a scan,
    // never competes with USCIS's words.
    ".uscistr-root .uscistr-collapsed-place {",
    "  margin-top: 2px; padding-left: calc(7px + var(--ust-s3));",
    "  font-size: var(--ust-fs-micro); color: var(--ust-text-3);",
    "}",
  ".uscistr-root .uscistr-card.uscistr-is-collapsed { padding: 0; }",
  ".uscistr-root .uscistr-card {",
  "  position: relative;",
  "  display: flex;",
  "  flex-direction: column;",
  "  gap: var(--ust-s5);",
  "  padding: var(--ust-s6) var(--ust-s6) var(--ust-s6) var(--ust-s6);",
  "  box-shadow: inset 0 -1px 0 var(--ust-border-1);",
  "  transition: background-color var(--ust-d2) var(--ust-ease);",
  "}",
  ".uscistr-root .uscistr-card:last-child { box-shadow: none; }",
  ".uscistr-root .uscistr-card::before {",
  "  content: \"\";",
  "  position: absolute;",
  "  left: 0;",
  "  top: var(--ust-s6);",
  "  bottom: var(--ust-s6);",
  "  width: 2px;",
  "  border-radius: 0 var(--ust-r-full) var(--ust-r-full) 0;",
  "  background: transparent;",
  "  transition: background-color var(--ust-d2) var(--ust-ease);",
  "}",
  ".uscistr-root .uscistr-card.uscistr-is-changed { background: var(--ust-tint-accent); }",
  ".uscistr-root .uscistr-card.uscistr-is-changed::before { background: var(--ust-accent-solid); }",
  ".uscistr-root .uscistr-card.uscistr-is-attention::before { background: var(--ust-warn); }",
  ".uscistr-root .uscistr-card.uscistr-is-error::before { background: var(--ust-danger); }",
  ".uscistr-root .uscistr-card.uscistr-is-closed .uscistr-card-label { color: var(--ust-text-2); }",
  ".uscistr-root .uscistr-card-header {",
  "  display: grid;",
  "  grid-template-columns: 1fr auto;",
  "  align-items: start;",
  "  gap: var(--ust-s4);",
  "}",
  ".uscistr-root .uscistr-card-title { display: flex; flex-direction: column; gap: var(--ust-s2); min-width: 0; }",
  ".uscistr-root .uscistr-card-eyebrow { display: flex; align-items: center; flex-wrap: wrap; gap: var(--ust-s3) var(--ust-s3); min-width: 0; }",
  ".uscistr-root .uscistr-card-label {",
  "  font-size: var(--ust-fs-heading);",
  "  line-height: var(--ust-lh-heading);",
  "  font-weight: 600;",
  "  letter-spacing: -0.008em;",
  "  color: var(--ust-text-1);",
  "  overflow: hidden;",
  "  text-overflow: ellipsis;",
  "  display: -webkit-box;",
  "  -webkit-line-clamp: 2;",
  "  -webkit-box-orient: vertical;",
  "}",
  ".uscistr-root .uscistr-card-actions { display: flex; align-items: center; gap: var(--ust-s1); flex: none; }",
  ".uscistr-root .uscistr-receipt {",
  "  display: inline-flex;",
  "  align-items: center;",
  "  gap: var(--ust-s3);",
  "  align-self: flex-start;",
  "  max-width: 100%;",
  "  height: 22px;",
  "  margin-left: -4px;",
  "  padding: 0 var(--ust-s2);",
  "  border: 1px solid transparent;",
  "  border-radius: var(--ust-r-sm);",
  "  background: transparent;",
  "  color: var(--ust-text-2);",
  "  font-family: var(--ust-mono);",
  "  font-size: var(--ust-fs-mono);",
  "  font-weight: 500;",
  "  letter-spacing: 0.035em;",
  "  font-variant-numeric: tabular-nums;",
  "  line-height: 1;",
  "  cursor: pointer;",
  "  transition: background-color var(--ust-d1) var(--ust-ease), color var(--ust-d1) var(--ust-ease), border-color var(--ust-d1) var(--ust-ease);",
  "}",
  ".uscistr-root .uscistr-receipt svg { width: 12px; height: 12px; opacity: 0; transition: opacity var(--ust-d1) var(--ust-ease); }",
  ".uscistr-root .uscistr-receipt:hover { background: var(--ust-bg-inset); border-color: var(--ust-border-1); color: var(--ust-text-1); }",
  ".uscistr-root .uscistr-receipt:hover svg { opacity: 1; }",
  ".uscistr-root .uscistr-receipt.uscistr-is-redacted { letter-spacing: 0.08em; }",
  ".uscistr-root .uscistr-card-footer {",
  "  display: flex;",
  "  align-items: center;",
  "  gap: var(--ust-s2);",
  "  flex-wrap: wrap;",
  "  padding-top: var(--ust-s1);",
  "}",
  ".uscistr-root .uscistr-card-footer .uscistr-btn-danger { margin-left: auto; }",
  ".uscistr-root .uscistr-status-block { display: flex; flex-direction: column; gap: var(--ust-s3); }",
  ".uscistr-root .uscistr-status-row { display: flex; align-items: center; gap: var(--ust-s3); flex-wrap: wrap; }",
  ".uscistr-root .uscistr-status-text {",
  // Serif, and the largest thing on the card. USCIS's own sentence about
  // this person's case is the reason the panel exists; setting it in the
  // same sans as the chrome buried it under a static form title.
  "  font-family: var(--ust-serif);",
  "  font-size: var(--ust-fs-lede);",
  "  line-height: 1.3;",
  "  font-weight: 600;",
  "  letter-spacing: -0.004em;",
  "  color: var(--ust-text-1);",
  "  text-wrap: balance;",
  "}",
  ".uscistr-root .uscistr-status-desc {",
  "  font-size: var(--ust-fs-body);",
  "  line-height: var(--ust-lh-body);",
  "  color: var(--ust-text-2);",
  "}",
  ".uscistr-root .uscistr-status-desc.uscistr-is-clamped {",
  "  display: -webkit-box;",
  "  -webkit-line-clamp: 3;",
  "  -webkit-box-orient: vertical;",
  "  overflow: hidden;",
  "}",
  ".uscistr-root .uscistr-more {",
  "  align-self: flex-start;",
  "  border: 0;",
  "  background: none;",
  "  color: var(--ust-accent);",
  "  font-size: var(--ust-fs-meta);",
  "  font-weight: 560;",
  "  line-height: 1.2;",
  "  cursor: pointer;",
  "  border-radius: var(--ust-r-xs);",
  "}",
  ".uscistr-root .uscistr-more:hover { text-decoration: underline; text-underline-offset: 2px; }",
  ".uscistr-root .uscistr-change {",
  "  display: grid;",
  "  grid-template-columns: auto 1fr auto;",
  "  align-items: center;",
  "  gap: var(--ust-s3);",
  "  padding: var(--ust-s3) var(--ust-s4);",
  "  border: 1px solid var(--ust-accent-soft-border);",
  "  border-radius: var(--ust-r-md);",
  "  background: var(--ust-accent-soft);",
  "  color: var(--ust-accent-soft-text);",
  "  font-size: var(--ust-fs-meta);",
  "  line-height: 1.4;",
  "  font-weight: 500;",
  "}",
  ".uscistr-root .uscistr-change svg { width: 13px; height: 13px; flex: none; }",
  ".uscistr-root .uscistr-change b { font-weight: 650; }",
  ".uscistr-root .uscistr-fields {",
  "  display: grid;",
  "  grid-template-columns: max-content minmax(0, 1fr);",
  "  column-gap: var(--ust-s6);",
  "  row-gap: var(--ust-s3);",
  "  align-items: baseline;",
  "}",
  ".uscistr-root .uscistr-field-label {",
  "  font-size: var(--ust-fs-meta);",
  "  line-height: var(--ust-lh-meta);",
  "  font-weight: 500;",
  "  color: var(--ust-text-3);",
  "  white-space: nowrap;",
  "}",
  ".uscistr-root .uscistr-field-value {",
  "  display: flex;",
  "  align-items: baseline;",
  "  flex-wrap: wrap;",
  "  gap: var(--ust-s3);",
  "  font-size: var(--ust-fs-meta);",
  "  line-height: var(--ust-lh-meta);",
  "  color: var(--ust-text-1);",
  "  font-variant-numeric: tabular-nums;",
  "  min-width: 0;",
  "}",
  ".uscistr-root .uscistr-rel { color: var(--ust-text-3); }",
  ".uscistr-root .uscistr-progress { display: flex; flex-direction: column; gap: var(--ust-s3); }",
  ".uscistr-root .uscistr-progress-head {",
  "  display: flex;",
  "  align-items: baseline;",
  "  justify-content: space-between;",
  "  gap: var(--ust-s4);",
  "  font-size: var(--ust-fs-meta);",
  "  line-height: 1.3;",
  "}",
  ".uscistr-root .uscistr-progress-head b { font-weight: 600; color: var(--ust-text-1); }",
  ".uscistr-root .uscistr-progress-track {",
  "  position: relative;",
  "  height: 6px;",
  "  border-radius: var(--ust-r-full);",
  "  background: var(--ust-track);",
  "  overflow: hidden;",
  "}",
  ".uscistr-root .uscistr-progress-fill {",
  "  height: 100%;",
  "  border-radius: var(--ust-r-full);",
  "  background: var(--ust-accent-solid);",
  "  transition: width var(--ust-d4) var(--ust-ease-out);",
  "}",
  ".uscistr-root .uscistr-progress-label { font-size: var(--ust-fs-micro); line-height: 1.4; color: var(--ust-text-3); }",
  ".uscistr-root .uscistr-section { display: flex; flex-direction: column; gap: var(--ust-s4); }",
  ".uscistr-root .uscistr-section-title {",
  "  display: flex;",
  "  align-items: center;",
  "  gap: var(--ust-s3);",
  "  font-size: var(--ust-fs-micro);",
  "  line-height: var(--ust-lh-micro);",
  "  font-weight: 600;",
  "  text-transform: uppercase;",
  "  letter-spacing: 0.075em;",
  "  color: var(--ust-text-3);",
  "}",
  ".uscistr-root .uscistr-section-title::after {",
  "  content: \"\";",
  "  flex: 1 1 auto;",
  "  height: 1px;",
  "  background: var(--ust-border-1);",
  "}",
  ".uscistr-root .uscistr-note {",
  "  padding: var(--ust-s4) var(--ust-s5);",
  "  border: 1px dashed var(--ust-border-2);",
  "  border-radius: var(--ust-r-md);",
  "  background: var(--ust-bg-sunken);",
  "  color: var(--ust-text-3);",
  "  font-size: var(--ust-fs-meta);",
  "  line-height: 1.5;",
  "}",
  ".uscistr-root .uscistr-timeline { position: relative; display: flex; flex-direction: column; padding-left: 14px; }",
  ".uscistr-root .uscistr-timeline::before {",
  "  content: \"\";",
  "  position: absolute;",
  "  left: 3px;",
  "  top: 10px;",
  "  bottom: 10px;",
  "  width: 1px;",
  "  background: var(--ust-border-2);",
  "}",
  ".uscistr-root .uscistr-timeline-row {",
  "  position: relative;",
  "  display: grid;",
  "  grid-template-columns: 58px minmax(0, 1fr);",
  "  column-gap: var(--ust-s4);",
  "  padding: var(--ust-s3) 0;",
  "}",
  ".uscistr-root .uscistr-timeline-row::before {",
  "  content: \"\";",
  "  position: absolute;",
  "  left: -14px;",
  "  top: 11px;",
  "  width: 7px;",
  "  height: 7px;",
  "  border-radius: var(--ust-r-full);",
  "  background: var(--ust-border-field);",
  "  box-shadow: 0 0 0 3px var(--ust-bg-panel);",
  "}",
  ".uscistr-root .uscistr-card.uscistr-is-changed .uscistr-timeline-row::before { box-shadow: none; }",
  ".uscistr-root .uscistr-timeline-row.uscistr-is-current::before {",
  "  background: var(--ust-accent-solid);",
  "  box-shadow: 0 0 0 3px var(--ust-bg-panel), 0 0 0 5px var(--ust-accent-soft);",
  "}",
  ".uscistr-root .uscistr-timeline-date {",
  "  font-family: var(--ust-mono);",
  "  font-size: var(--ust-fs-micro);",
  "  line-height: 1.5;",
  "  font-variant-numeric: tabular-nums;",
  "  letter-spacing: 0.01em;",
  "  color: var(--ust-text-3);",
  "  white-space: nowrap;",
  "  padding-top: 1px;",
  "}",
  ".uscistr-root .uscistr-timeline-body { display: flex; flex-direction: column; gap: var(--ust-s2); min-width: 0; }",
  ".uscistr-root .uscistr-timeline-text {",
  "  font-size: var(--ust-fs-meta);",
  "  line-height: 1.5;",
  "  color: var(--ust-text-1);",
  "}",
  ".uscistr-root .uscistr-timeline-row.uscistr-is-current .uscistr-timeline-text { font-weight: 560; }",
  ".uscistr-root .uscistr-timeline-meta { display: flex; align-items: center; gap: var(--ust-s3); flex-wrap: wrap; }",
  ".uscistr-root .uscistr-documents { display: flex; flex-direction: column; gap: var(--ust-s1); }",
  ".uscistr-root .uscistr-doc-row {",
  "  display: grid;",
  "  grid-template-columns: 16px minmax(0, 1fr) auto;",
  "  align-items: center;",
  "  gap: var(--ust-s4);",
  "  padding: var(--ust-s3) var(--ust-s4);",
  "  margin: 0 calc(var(--ust-s4) * -1);",
  "  border-radius: var(--ust-r-md);",
  "  transition: background-color var(--ust-d1) var(--ust-ease);",
  "}",
  ".uscistr-root .uscistr-doc-row:hover { background: var(--ust-bg-hover); }",
  ".uscistr-root .uscistr-doc-row svg { width: 14px; height: 14px; color: var(--ust-text-3); }",
  ".uscistr-root .uscistr-doc-main { display: flex; align-items: baseline; gap: var(--ust-s3); min-width: 0; font-size: var(--ust-fs-meta); line-height: var(--ust-lh-meta); color: var(--ust-text-1); }",
  ".uscistr-root .uscistr-doc-main > span:first-child { flex: 0 0 auto; white-space: nowrap; }",
  ".uscistr-root .uscistr-doc-name { flex: 0 1 auto; color: var(--ust-text-3); }",
  ".uscistr-root .uscistr-doc-name {",
  "  font-family: var(--ust-mono);",
  "  font-size: var(--ust-fs-meta);",
  "  line-height: 1.4;",
  "  color: var(--ust-text-1);",
  "  white-space: nowrap;",
  "  overflow: hidden;",
  "  text-overflow: ellipsis;",
  "  direction: ltr;",
  "}",
  ".uscistr-root .uscistr-doc-date {",
  "  font-size: var(--ust-fs-micro);",
  "  line-height: 1.4;",
  "  color: var(--ust-text-3);",
  "  font-variant-numeric: tabular-nums;",
  "  white-space: nowrap;",
  "}",
  ".uscistr-root .uscistr-raw-wrap { display: flex; flex-direction: column; gap: var(--ust-s3); }",
  ".uscistr-root .uscistr-docs-wrap { display: flex; flex-direction: column; gap: var(--ust-s3); }",
  ".uscistr-root .uscistr-raw-list { display: flex; flex-direction: column; gap: var(--ust-s3); }",
  // The one summary row that stands in for a whole collapsed section. Sized
  // like a control rather than like the mono endpoint rows beneath it, so the
  // thing you click is legible at a glance and the paths stay subordinate.
  ".uscistr-root .uscistr-raw-toggle {",
  "  display: flex; align-items: center; gap: var(--ust-s3);",
  "  width: calc(100% + var(--ust-s4) * 2);",
  "  height: 26px;",
  "  padding: 0 var(--ust-s4);",
  "  margin: 0 calc(var(--ust-s4) * -1);",
  "  border-radius: var(--ust-r-sm);",
  "  background: transparent;",
  "  color: var(--ust-text-3);",
  "  font-size: var(--ust-fs-micro);",
  "  text-align: left;",
  "  cursor: pointer;",
  "  transition: background-color var(--ust-d1) var(--ust-ease), color var(--ust-d1) var(--ust-ease);",
  "}",
  ".uscistr-root .uscistr-raw-toggle:hover { background: var(--ust-bg-hover); color: var(--ust-text-1); }",
  ".uscistr-root .uscistr-raw-toggle svg {",
  "  width: 12px; height: 12px; flex: none;",
  "  transition: transform var(--ust-d2) var(--ust-ease);",
  "}",
  ".uscistr-root .uscistr-raw-toggle[aria-expanded=\"true\"] svg { transform: rotate(90deg); }",
  ".uscistr-root .uscistr-raw-toggle[aria-expanded=\"true\"] { color: var(--ust-text-1); }",
  // Collapsed by default, and the only thing above the case list when open.
  ".uscistr-root .uscistr-add-toggle {",
  "  display: flex; align-items: center;",
  "  width: 100%; padding: var(--ust-s3) var(--ust-s5);",
  "  background: transparent; color: var(--ust-text-3);",
  "  font-size: var(--ust-fs-meta); text-align: left; cursor: pointer;",
  "  border-bottom: 1px solid var(--ust-border-1);",
  "  transition: color var(--ust-d1) var(--ust-ease);",
  "}",
  ".uscistr-root .uscistr-add-toggle:hover { color: var(--ust-text-1); }",
  // Both of these were emitted by the core with no rule anywhere, so they
  // inherited body size and colour. On the timeline that made the footnote
  // saying we cannot explain a code the loudest text in the section — the
  // exact outcome consolidating it to one line existed to prevent.
  ".uscistr-root .uscistr-timeline-footnote {",
  "  margin-top: var(--ust-s3);",
  "  font-size: var(--ust-fs-micro);",
  "  line-height: 1.45;",
  "  color: var(--ust-text-3);",
  "}",
  ".uscistr-root .uscistr-is-passed { opacity: 0.75; }",
  ".uscistr-root .uscistr-raw-summary {",
  "  display: grid;",
  "  grid-template-columns: 12px auto minmax(0, 1fr) auto;",
  "  align-items: center;",
  "  gap: var(--ust-s3);",
  "  width: calc(100% + var(--ust-s4) * 2);",
  "  height: 26px;",
  "  padding: 0 var(--ust-s4);",
  "  margin: 0 calc(var(--ust-s4) * -1);",
  "  border-radius: var(--ust-r-sm);",
  "  background: transparent;",
  "  color: var(--ust-text-3);",
  "  font-family: var(--ust-mono);",
  "  font-size: var(--ust-fs-micro);",
  "  letter-spacing: 0.01em;",
  "  cursor: pointer;",
  "  transition: background-color var(--ust-d1) var(--ust-ease), color var(--ust-d1) var(--ust-ease);",
  "}",
  ".uscistr-root .uscistr-raw-name { font-family: var(--ust-font); color: var(--ust-text-2); white-space: nowrap; }",
  ".uscistr-root .uscistr-raw-summary:hover { background: var(--ust-bg-hover); color: var(--ust-text-1); }",
  ".uscistr-root .uscistr-raw-summary svg {",
  "  width: 12px;",
  "  height: 12px;",
  "  transition: transform var(--ust-d2) var(--ust-ease);",
  "}",
  ".uscistr-root .uscistr-raw-summary[aria-expanded=\"true\"] svg { transform: rotate(90deg); }",
  ".uscistr-root .uscistr-raw-summary[aria-expanded=\"true\"] { color: var(--ust-text-1); }",
  ".uscistr-root .uscistr-raw-path { text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
  ".uscistr-root .uscistr-raw {",
  "  max-height: 200px;",
  "  padding: var(--ust-s5);",
  "  border: 1px solid var(--ust-border-1);",
  "  border-radius: var(--ust-r-md);",
  "  background: var(--ust-bg-inset);",
  "  color: var(--ust-text-2);",
  "  font-family: var(--ust-mono);",
  "  font-size: var(--ust-fs-micro);",
  "  line-height: 1.55;",
  "  white-space: pre;",
  "  overflow: auto;",
  "  overscroll-behavior: contain;",
  "  scrollbar-width: thin;",
  "  scrollbar-color: var(--ust-scroll-thumb) transparent;",
  "  -webkit-user-select: text;",
  "  user-select: text;",
  "}",
  ".uscistr-root .uscistr-raw::-webkit-scrollbar { width: 10px; height: 10px; }",
  ".uscistr-root .uscistr-raw::-webkit-scrollbar-thumb {",
  "  background-color: var(--ust-scroll-thumb);",
  "  border: 3px solid transparent;",
  "  background-clip: padding-box;",
  "  border-radius: var(--ust-r-full);",
  "}",
  ".uscistr-root .uscistr-raw[hidden] { display: none; }",

  // The record view: every field USCIS returned, as label/value rows.
  // (docs/design/05-record-view.md.) Values are the content, so keys are the
  // quieter column — the inverse of a form, where the label leads.
  ".uscistr-root .uscistr-rec-section {",
  "  display: flex;",
  "  flex-direction: column;",
  "  gap: var(--ust-s3);",
  "  padding: var(--ust-s4) 0 var(--ust-s4) var(--ust-s4);",
  "}",
  ".uscistr-root .uscistr-rec-fields { display: flex; flex-direction: column; gap: 2px; }",
  ".uscistr-root .uscistr-rec-row {",
  "  display: grid;",
  "  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);",
  "  gap: var(--ust-s4);",
  "  align-items: baseline;",
  "  font-size: var(--ust-fs-micro);",
  "  line-height: 1.5;",
  "  padding: 2px 0;",
  "}",
  ".uscistr-root .uscistr-rec-key { color: var(--ust-text-3); min-width: 0; overflow-wrap: break-word; }",
  ".uscistr-root .uscistr-rec-val {",
  "  color: var(--ust-text-1);",
  "  min-width: 0;",
  "  overflow-wrap: anywhere;",
  // Values are the one thing here worth copying out of the panel.
  "  -webkit-user-select: text;",
  "  user-select: text;",
  "}",
  ".uscistr-root .uscistr-rec-group-wrap { display: flex; flex-direction: column; }",
  ".uscistr-root .uscistr-rec-group {",
  "  display: flex;",
  "  align-items: center;",
  "  gap: var(--ust-s3);",
  "  padding: 3px 0;",
  "  background: transparent;",
  "  border: 0;",
  "  color: var(--ust-text-2);",
  "  font: inherit;",
  "  font-size: var(--ust-fs-micro);",
  "  text-align: left;",
  "  cursor: pointer;",
  "}",
  ".uscistr-root .uscistr-rec-group:hover { color: var(--ust-text-1); }",
  ".uscistr-root .uscistr-rec-group svg { width: 10px; height: 10px; flex: none; transition: transform var(--ust-d2) var(--ust-ease); }",
  ".uscistr-root .uscistr-rec-group[aria-expanded=\"true\"] svg { transform: rotate(90deg); }",
  // Nesting is shown by indentation and a hairline, so depth is legible
  // without numbering the levels.
  ".uscistr-root .uscistr-rec-group-body {",
  "  display: flex;",
  "  flex-direction: column;",
  "  gap: 2px;",
  "  margin-left: 5px;",
  "  padding-left: var(--ust-s4);",
  "  border-left: 1px solid var(--ust-border-1);",
  "}",
  ".uscistr-root .uscistr-rec-json { display: flex; flex-direction: column; gap: var(--ust-s3); }",
  // The `hidden` attribute only sets `display: none` from the user-agent
  // stylesheet, so any author rule setting `display` beats it — which is every
  // collapsible container here, since they are all flex. Without this the
  // collapse toggles rotate their chevron and change nothing.
  ".uscistr-root [hidden] { display: none; }",
  ".uscistr-root .uscistr-empty {",
  "  display: flex;",
  "  flex-direction: column;",
  "  align-items: center;",
  "  text-align: center;",
  "  gap: var(--ust-s4);",
  "  padding: var(--ust-s10) var(--ust-s8);",
  "}",
  ".uscistr-root .uscistr-empty-icon {",
  "  display: flex;",
  "  align-items: center;",
  "  justify-content: center;",
  "  width: 40px;",
  "  height: 40px;",
  "  border-radius: var(--ust-r-full);",
  "  background: var(--ust-bg-inset);",
  "  color: var(--ust-text-3);",
  "  margin-bottom: var(--ust-s1);",
  "}",
  ".uscistr-root .uscistr-empty-icon svg { width: 18px; height: 18px; }",
  ".uscistr-root .uscistr-empty-title { font-size: var(--ust-fs-heading); line-height: 1.35; font-weight: 600; color: var(--ust-text-1); }",
  ".uscistr-root .uscistr-empty-text { font-size: var(--ust-fs-body); line-height: 1.55; color: var(--ust-text-3); max-width: 30ch; }",
  ".uscistr-root .uscistr-empty .uscistr-btn { margin-top: var(--ust-s2); }",
  ".uscistr-root .uscistr-popover {",
  "  position: absolute;",
  "  top: 42px;",
  "  right: var(--ust-s5);",
  "  z-index: 6;",
  "  width: 262px;",
  "  padding: var(--ust-s3);",
  "  border: 1px solid var(--ust-border-2);",
  "  border-radius: var(--ust-r-lg);",
  "  background: var(--ust-bg-raised-solid);",
  "  box-shadow: var(--ust-sh-pop), var(--ust-sh-inner);",
  "  animation: ust-pop-in var(--ust-d3) var(--ust-ease-out) both;",
  "  transform-origin: top right;",
  // The popover is taller than a short panel, and the panel clips its
  // overflow — so the bottom was simply unreachable. What fell off the end was
  // "Erase everything", with its description cut mid-sentence and the button
  // itself part-clipped: a destructive control the reader could neither fully
  // read nor reliably press.
  "  max-height: calc(100% - 52px);",
  "  overflow-y: auto;",
  "  overscroll-behavior: contain;",
  "}",
  ".uscistr-root .uscistr-popover-head {",
  "  padding: var(--ust-s2) var(--ust-s4) var(--ust-s4);",
  "  font-size: var(--ust-fs-micro);",
  "  font-weight: 600;",
  "  text-transform: uppercase;",
  "  letter-spacing: 0.075em;",
  "  color: var(--ust-text-3);",
  "}",
  ".uscistr-root .uscistr-popover-row {",
  "  display: grid;",
  "  grid-template-columns: minmax(0, 1fr) auto;",
  "  align-items: center;",
  "  gap: var(--ust-s5);",
  "  padding: var(--ust-s4);",
  "  border-radius: var(--ust-r-md);",
  "  transition: background-color var(--ust-d1) var(--ust-ease);",
  "}",
  ".uscistr-root .uscistr-popover-row:hover { background: var(--ust-bg-hover); }",
  ".uscistr-root .uscistr-popover-label { font-size: var(--ust-fs-body); line-height: 1.3; font-weight: 500; color: var(--ust-text-1); }",
  ".uscistr-root .uscistr-popover-desc { font-size: var(--ust-fs-micro); line-height: 1.4; color: var(--ust-text-3); margin-top: 2px; }",
  ".uscistr-root .uscistr-popover-sep { height: 1px; margin: var(--ust-s2) var(--ust-s4); background: var(--ust-border-1); }",
  ".uscistr-root .uscistr-popover .uscistr-select { width: 104px; height: 26px; line-height: 24px; font-size: var(--ust-fs-meta); }",
  ".uscistr-root .uscistr-mono { font-family: var(--ust-mono); font-variant-numeric: tabular-nums; }",
  ".uscistr-root .uscistr-muted { color: var(--ust-text-3); }",
  ".uscistr-root .uscistr-small { font-size: var(--ust-fs-meta); line-height: var(--ust-lh-meta); }",
  ".uscistr-root .uscistr-truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }",
  ".uscistr-root .uscistr-link { color: var(--ust-accent); text-decoration: underline; text-underline-offset: 2px; cursor: pointer; border-radius: var(--ust-r-xs); }",
  ".uscistr-root .uscistr-skeleton {",
  "  border-radius: var(--ust-r-xs);",
  "  background: linear-gradient(90deg, var(--ust-bg-inset) 25%, var(--ust-bg-hover) 37%, var(--ust-bg-inset) 63%);",
  "  background-size: 400% 100%;",
  "  animation: ust-shimmer 1.4s ease-in-out infinite;",
  "  color: transparent;",
  "}",
  ".uscistr-root .uscistr-card-number {",
  "  font-family: var(--ust-mono);",
  "  font-size: var(--ust-fs-mono);",
  "  letter-spacing: 0.035em;",
  "  font-variant-numeric: tabular-nums;",
  "  color: var(--ust-text-2);",
  "}",
  ".uscistr-root .uscistr-version { font-size: var(--ust-fs-micro); color: var(--ust-text-3); font-variant-numeric: tabular-nums; }",
  "@keyframes ust-panel-in {",
  "  from { opacity: 0; transform: translateY(8px) scale(0.985); }",
  "  to   { opacity: 1; transform: none; }",
  "}",
  "@keyframes ust-pop-in {",
  "  from { opacity: 0; transform: translateY(-4px) scale(0.97); }",
  "  to   { opacity: 1; transform: none; }",
  "}",
  "@keyframes ust-spin { to { transform: rotate(360deg); } }",
  "@keyframes ust-ping {",
  "  0%   { opacity: 0.7; transform: scale(0.8); }",
  "  70%  { opacity: 0;   transform: scale(1.9); }",
  "  100% { opacity: 0;   transform: scale(1.9); }",
  "}",
  "@keyframes ust-shimmer { from { background-position: 100% 0; } to { background-position: 0 0; } }",
  "@keyframes ust-drift { to { background-position: -200% 0; } }",
  "@media (prefers-reduced-motion: reduce) {",
  "  .uscistr-root,",
  "  .uscistr-root *,",
  "  .uscistr-root *::before,",
  "  .uscistr-root *::after {",
  "    animation-duration: 1ms !important;",
  "    animation-iteration-count: 1 !important;",
  "    transition-duration: 1ms !important;",
  "    scroll-behavior: auto !important;",
  "  }",
  "  .uscistr-root .uscistr-pill:hover { transform: none; }",
  "  .uscistr-root .uscistr-btn:active { transform: none; }",
  "}",
  ".uscistr-root .uscistr-ico .uscistr-fill { fill: currentColor; stroke: none; }",
  ".uscistr-root .uscistr-ico .uscistr-faint { opacity: 0.4; }",
  ".uscistr-root .uscistr-ico .uscistr-thin { stroke-width: 1; }",
  ".uscistr-root .uscistr-ico .uscistr-hair { stroke-width: 1.3; }",
  ".uscistr-root .uscistr-timeline { padding-left: 0; }",
  ".uscistr-root .uscistr-timeline::before { display: none; }",
  ".uscistr-root .uscistr-timeline-row {",
  "  display: grid;",
  "  grid-template-columns: 18px minmax(0, 1fr);",
  "  column-gap: var(--ust-s4);",
  "  padding: 0;",
  "}",
  ".uscistr-root .uscistr-timeline-row::before { display: none; }",
  ".uscistr-root .uscistr-node {",
  "  position: relative;",
  "  display: flex;",
  "  justify-content: center;",
  "  color: var(--ust-text-3);",
  "}",
  ".uscistr-root .uscistr-node svg { width: 12px; height: 12px; margin-top: 7px; }",
  ".uscistr-root .uscistr-node::after {",
  "  content: \"\";",
  "  position: absolute;",
  "  left: 50%;",
  "  top: 22px;",
  "  bottom: -2px;",
  "  width: 1px;",
  "  margin-left: -0.5px;",
  "  background: var(--ust-border-2);",
  "}",
  ".uscistr-root .uscistr-node-last::after { display: none; }",
  ".uscistr-root .uscistr-node-through::after { top: 0; }",
  ".uscistr-root .uscistr-node-official { color: var(--ust-accent); }",
  ".uscistr-root .uscistr-node-coded { color: var(--ust-accent); }",
  ".uscistr-root .uscistr-node-quiet { color: var(--ust-text-3); }",
  ".uscistr-root .uscistr-node-local { color: var(--ust-warn); }",
  ".uscistr-root .uscistr-node-attention { color: var(--ust-danger); }",
  ".uscistr-root .uscistr-timeline-cell { min-width: 0; padding: var(--ust-s3) 0; }",
  ".uscistr-root .uscistr-row-toggle {",
  "  display: block;",
  "  width: 100%;",
  "  text-align: left;",
  "  border-radius: var(--ust-r-sm);",
  "  cursor: pointer;",
  "  background: transparent;",
  "}",
  ".uscistr-root .uscistr-row-toggle:hover { background: var(--ust-bg-hover); }",
  ".uscistr-root .uscistr-timeline-head {",
  "  display: flex;",
  "  align-items: baseline;",
  "  justify-content: space-between;",
  "  gap: var(--ust-s3);",
  "}",
  ".uscistr-root .uscistr-timeline-text.uscistr-is-quiet { color: var(--ust-text-3); }",
  ".uscistr-root .uscistr-timeline-text.uscistr-is-attention { font-weight: 600; }",
  ".uscistr-root .uscistr-unofficial-label { text-decoration: underline dotted; text-underline-offset: 3px; }",
  ".uscistr-root .uscistr-timeline-sub {",
  "  font-family: var(--ust-mono);",
  "  font-size: var(--ust-fs-micro);",
  "  line-height: 1.4;",
  "  color: var(--ust-text-3);",
  "  overflow: hidden;",
  "  text-overflow: ellipsis;",
  "  white-space: nowrap;",
  "}",
  ".uscistr-root .uscistr-disclosure {",
  "  margin-top: var(--ust-s3);",
  "  padding: var(--ust-s4);",
  "  border-radius: var(--ust-r-sm);",
  "  background: var(--ust-bg-sunken);",
  "  color: var(--ust-text-2);",
  "  font-size: var(--ust-fs-meta);",
  "  line-height: 1.55;",
  "}",
  ".uscistr-root .uscistr-disclosure p { margin-top: var(--ust-s3); }",
  ".uscistr-root .uscistr-disclosure p:first-child { margin-top: 0; }",
  ".uscistr-root .uscistr-gap {",
  "  display: grid;",
  "  grid-template-columns: 18px minmax(0, 1fr);",
  "  column-gap: var(--ust-s4);",
  "}",
  ".uscistr-root .uscistr-gap-text {",
  "  padding: var(--ust-s2) 0;",
  "  font-size: var(--ust-fs-micro);",
  "  line-height: 1.4;",
  "  color: var(--ust-text-3);",
  "  font-variant-numeric: tabular-nums;",
  "}",
  ".uscistr-root .uscistr-timeline-fold { margin-top: var(--ust-s3); align-self: flex-start; }",
  ".uscistr-root .uscistr-stage { display: flex; align-items: flex-start; }",
  ".uscistr-root .uscistr-stage-seg {",
  "  position: relative;",
  "  flex: 1 1 0;",
  "  min-width: 0;",
  "  display: flex;",
  "  flex-direction: column;",
  "  align-items: center;",
  "  gap: var(--ust-s2);",
  "}",
  ".uscistr-root .uscistr-stage-seg::after {",
  "  content: \"\";",
  "  position: absolute;",
  "  top: 5px;",
  "  left: calc(50% + 9px);",
  "  right: calc(-50% + 9px);",
  "  height: 2px;",
  "  border-radius: var(--ust-r-full);",
  "  background: var(--ust-border-2);",
  "}",
  ".uscistr-root .uscistr-stage-seg:last-child::after { display: none; }",
  ".uscistr-root .uscistr-stage-seg.uscistr-is-done::after { background: var(--ust-accent-solid); }",
  ".uscistr-root .uscistr-stage-seg.uscistr-is-ahead::after {",
  "  height: 0;",
  "  background: transparent;",
  "  border-top: 2px dotted var(--ust-border-field);",
  "}",
  ".uscistr-root .uscistr-stage-node { display: flex; align-items: center; justify-content: center; height: 12px; color: var(--ust-border-field); }",
  ".uscistr-root .uscistr-stage-node svg { width: 11px; height: 11px; }",
  ".uscistr-root .uscistr-stage-seg.uscistr-is-done .uscistr-stage-node,",
  ".uscistr-root .uscistr-stage-seg.uscistr-is-current .uscistr-stage-node { color: var(--ust-accent); }",
  // Full stage names, wrapped rather than abbreviated. "Recv" and "Intvw"
  // saved four characters each and cannot be translated, read aloud, or
  // guessed by someone who has not seen them before — on a rail that is
  // already labelled as this tool's own reading of the codes.
  ".uscistr-root .uscistr-stage-label {",
  "  font-size: var(--ust-fs-rail);",
  "  line-height: 1.2;",
  "  text-align: center;",
  "  color: var(--ust-text-3);",
  "  letter-spacing: 0.01em;",
  "  max-width: 100%;",
  "  overflow-wrap: break-word;",
  "  hyphens: auto;",
  "}",
  ".uscistr-root .uscistr-stage-seg.uscistr-is-done .uscistr-stage-label { color: var(--ust-text-2); }",
  ".uscistr-root .uscistr-stage-seg.uscistr-is-current .uscistr-stage-label { color: var(--ust-text-1); font-weight: 600; }",
  // Not-reported: the form's own instructions provide for this step, and
  // USCIS does not report it in this data. A dashed ring, deliberately unlike
  // both "done" (filled) and "ahead" (plain hollow): this marker must not be
  // readable as either "happened" or "hasn't happened yet".
  ".uscistr-root .uscistr-stage-seg.uscistr-is-unreported .uscistr-stage-node { color: var(--ust-text-3); }",
  ".uscistr-root .uscistr-stage-seg.uscistr-is-unreported .uscistr-stage-node svg circle {",
  "  stroke-dasharray: 2.4 1.8;",
  "}",
  ".uscistr-root .uscistr-stage-seg.uscistr-is-unreported .uscistr-stage-label {",
  "  color: var(--ust-text-3);",
  "  font-style: italic;",
  "}",
  ".uscistr-root .uscistr-stage-here { font-size: var(--ust-fs-rail); line-height: 1.2; color: var(--ust-accent); white-space: nowrap; }",
  ".uscistr-root .uscistr-quiet { display: flex; flex-direction: column; gap: var(--ust-s2); }",
  ".uscistr-root .uscistr-quiet-head {",
  "  display: flex;",
  "  align-items: baseline;",
  "  justify-content: space-between;",
  "  gap: var(--ust-s4);",
  "  font-size: var(--ust-fs-meta);",
  "  line-height: 1.3;",
  "  color: var(--ust-text-2);",
  "  font-variant-numeric: tabular-nums;",
  "}",
  ".uscistr-root .uscistr-upcoming {",
  "  display: grid;",
  "  grid-template-columns: auto minmax(0, 1fr) auto;",
  "  align-items: center;",
  "  gap: var(--ust-s4);",
  "  padding: var(--ust-s4) var(--ust-s5);",
  "  border: 1px solid var(--ust-accent-soft-border);",
  "  border-radius: var(--ust-r-md);",
  "  background: var(--ust-tint-accent);",
  "}",
  ".uscistr-root .uscistr-upcoming svg { width: 14px; height: 14px; color: var(--ust-accent); }",
  ".uscistr-root .uscistr-upcoming-title { font-size: var(--ust-fs-meta); font-weight: 600; color: var(--ust-text-1); }",
  ".uscistr-root .uscistr-upcoming-meta { font-size: var(--ust-fs-micro); color: var(--ust-text-3); }",
  ".uscistr-root .uscistr-section-count { font-weight: 500; letter-spacing: 0.02em; }",
  ".uscistr-root .uscistr-doc-meta { display: flex; align-items: center; gap: var(--ust-s3); }",
  ".uscistr-root .uscistr-add-error { grid-column: 1 / -1; display: flex; align-items: baseline; gap: var(--ust-s4); }",
  ".uscistr-root .uscistr-add-error .uscistr-field-error { min-width: 0; }",
  ".uscistr-root .uscistr-stack { display: flex; flex-direction: column; gap: var(--ust-s3); }",
  ".uscistr-root .uscistr-skeleton-row { display: grid; grid-template-columns: 12px minmax(0, 1fr); column-gap: var(--ust-s4); align-items: center; }",
  ".uscistr-root .uscistr-skeleton-dot { width: 12px; height: 12px; border-radius: var(--ust-r-full); }",
  ".uscistr-root .uscistr-skeleton-bar { height: 9px; }",
  ".uscistr-root .uscistr-note-title { font-weight: 600; color: var(--ust-text-2); }",
  ".uscistr-root .uscistr-note p { margin-top: var(--ust-s2); }",
  ".uscistr-root .uscistr-note p:first-child { margin-top: 0; }",
  ".uscistr-root .uscistr-standing {",
  "  padding: var(--ust-s5) var(--ust-s6);",
  "  font-size: var(--ust-fs-micro);",
  "  line-height: 1.5;",
  "  color: var(--ust-text-3);",
  "  box-shadow: inset 0 1px 0 var(--ust-border-1);",
  "}",
  ".uscistr-root .uscistr-footer .uscistr-btn-sm { color: var(--ust-text-3); }",
  ".uscistr-root .uscistr-footer .uscistr-btn-sm:hover { color: var(--ust-text-1); background: var(--ust-bg-hover); }",
  ".uscistr-root .uscistr-timeline-meta { font-size: var(--ust-fs-micro); line-height: 1.4; color: var(--ust-text-3); }",
  ".uscistr-root .uscistr-timeline-note { font-size: var(--ust-fs-micro); line-height: 1.45; color: var(--ust-text-3); }",
  ".uscistr-root .uscistr-code-copy { align-self: flex-start; margin-top: var(--ust-s2); }",

  // The print choice — full record or masked copy — reuses the popover shell
  // but is raised by a footer button, not the header gear, so it is anchored
  // to the bottom instead of `top: 42px`. Three classes deep, so it outranks
  // the base rule wherever it sits in the file.
  ".uscistr-root .uscistr-popover.uscistr-print-choice {",
  "  top: auto;",
  "  bottom: 42px;",
  "  display: flex;",
  "  flex-direction: column;",
  "  gap: var(--ust-s2);",
  "  transform-origin: bottom right;",
  "}",
  ".uscistr-root .uscistr-print-choice .uscistr-popover-desc { margin-bottom: var(--ust-s3); }",

  // The printed record. Built into .uscistr-print inside .uscistr-root, kept
  // off-screen until a print starts (see main.js / uscistr-printing).
  //
  // This rule is deliberately a normal rule, not scoped to @media print: the
  // container is invisible on screen by construction, so if the print
  // teardown ever fails to run — a mid-print error, a browser that skips
  // afterprint — nothing is left visible behind it.
  ".uscistr-root .uscistr-print { display: none; }",

  "@media print {",
  "  html body.uscistr-printing > *:not(.uscistr-root) { display: none !important; }",
  "  body.uscistr-printing {",
  "    background: #FFFFFF !important;",
  "    margin: 0 !important;",
  "    padding: 0 !important;",
  "    height: auto !important;",
  "    min-height: 0 !important;",
  "    overflow: visible !important;",
  "  }",
  "  body.uscistr-printing .uscistr-root {",
  "    position: static !important;",
  "    width: auto !important;",
  "    height: auto !important;",
  "    overflow: visible !important;",
  "    display: block !important;",
  "    pointer-events: auto !important;",
  "    isolation: auto !important;",
  "    color-scheme: light !important;",
  "  }",
  "  body.uscistr-printing .uscistr-panel,",
  "  body.uscistr-printing .uscistr-pill { display: none !important; }",

  // Colour split: font SIZE below always uses the --ust-fs-doc-* tokens, but
  // colour is always a literal grey/black, never a --ust-* colour token. The
  // panel supports a dark theme; a printed record must be black-on-white
  // regardless of which theme was active on screen when it was generated.
  // Spacing (--ust-s*), radii and font families (--ust-font/--ust-serif/
  // --ust-mono) are theme-independent and safe to use here.
  "  .uscistr-root .uscistr-print {",
  "    display: block;",
  "    color: #000000;",
  "    background: #FFFFFF;",
  "    font-family: var(--ust-font);",
  "    font-size: var(--ust-fs-doc-body);",
  "    line-height: var(--ust-lh-doc-body);",
  "  }",
  "  .uscistr-root .uscistr-print-cover {",
  "    display: flex;",
  "    flex-direction: column;",
  "    gap: var(--ust-s4);",
  "    padding-bottom: var(--ust-s7);",
  "    margin-bottom: var(--ust-s7);",
  "    border-bottom: 1px solid #000000;",
  "  }",
  "  .uscistr-root .uscistr-print-title {",
  "    font-family: var(--ust-serif);",
  "    font-size: var(--ust-fs-doc-title);",
  "    line-height: var(--ust-lh-doc-title);",
  "    font-weight: 600;",
  "    color: #000000;",
  "  }",
  // Strength comes from a solid rule and generous padding, not colour — this
  // banner has to read as unmistakable in pure greyscale.
  "  .uscistr-root .uscistr-print-warn {",
  "    margin-top: var(--ust-s4);",
  "    padding: var(--ust-s4) var(--ust-s5);",
  "    border: 2px solid #000000;",
  "    font-weight: 700;",
  "    text-align: center;",
  "    text-transform: uppercase;",
  "    letter-spacing: 0.04em;",
  "    color: #000000;",
  "  }",
  "  .uscistr-root .uscistr-print-case {",
  "    display: flex;",
  "    flex-direction: column;",
  "    gap: var(--ust-s6);",
  "    padding-top: var(--ust-s7);",
  "    break-before: page;",
  "    page-break-before: always;",
  "  }",
  // No break-inside: avoid on the case itself — a case with a long timeline
  // is routinely taller than one page, and asking the browser to avoid
  // breaking inside it just makes it emit blank pages instead.
  "  .uscistr-root .uscistr-print-case:first-child {",
  "    padding-top: 0;",
  "    break-before: auto;",
  "    page-break-before: auto;",
  "  }",
  "  .uscistr-root .uscistr-print-h {",
  "    font-family: var(--ust-serif);",
  "    font-size: var(--ust-fs-doc-head);",
  "    line-height: var(--ust-lh-doc-head);",
  "    font-weight: 600;",
  "    color: #000000;",
  "    padding-bottom: var(--ust-s2);",
  "    margin-bottom: var(--ust-s3);",
  "    border-bottom: 1px solid #CCCCCC;",
  "    break-after: avoid;",
  "    page-break-after: avoid;",
  "  }",
  "  .uscistr-root .uscistr-print-block {",
  "    display: flex;",
  "    flex-direction: column;",
  "    gap: var(--ust-s4);",
  "    margin-bottom: var(--ust-s6);",
  "    break-inside: avoid;",
  "    page-break-inside: avoid;",
  "  }",
  "  .uscistr-root .uscistr-print-row {",
  "    display: grid;",
  "    grid-template-columns: 30% minmax(0, 1fr);",
  "    gap: var(--ust-s4);",
  "    align-items: baseline;",
  "    padding: 2px 0;",
  "    break-inside: avoid;",
  "    page-break-inside: avoid;",
  "  }",
  "  .uscistr-root .uscistr-print-key { color: #444444; }",
  "  .uscistr-root .uscistr-print-val { color: #000000; }",
  "  .uscistr-root .uscistr-print-note {",
  "    margin-top: var(--ust-s2);",
  "    padding-left: var(--ust-s5);",
  "    font-size: var(--ust-fs-doc-meta);",
  "    line-height: var(--ust-lh-doc-meta);",
  "    color: #444444;",
  "    font-style: italic;",
  "  }",
  "  .uscistr-root .uscistr-print-meta {",
  "    font-size: var(--ust-fs-doc-meta);",
  "    line-height: var(--ust-lh-doc-meta);",
  "    color: #767676;",
  "  }",
  // Same grid as a fact row, so a step and its date land on the column the
  // facts above them already established. A document that changes its
  // alignment halfway down a page reads as two documents.
  "  .uscistr-root .uscistr-print-stage {",
  "    display: grid;",
  "    grid-template-columns: 30% minmax(0, 1fr);",
  "    gap: var(--ust-s4);",
  "    align-items: baseline;",
  "    padding: 1px 0;",
  "    color: #000000;",
  "    break-inside: avoid;",
  "    page-break-inside: avoid;",
  "  }",
  "  .uscistr-root .uscistr-print-event {",
  "    display: flex;",
  "    flex-direction: column;",
  "    gap: 1px;",
  "    padding: var(--ust-s2) 0;",
  "    border-bottom: 1px solid #CCCCCC;",
  "    break-inside: avoid;",
  "    page-break-inside: avoid;",
  "  }",
  "  .uscistr-root .uscistr-print-prov {",
  "    font-size: var(--ust-fs-doc-meta);",
  "    line-height: var(--ust-lh-doc-meta);",
  "    color: #767676;",
  "  }",
  "  .uscistr-root .uscistr-print-appendix {",
  "    padding-top: var(--ust-s7);",
  "    break-before: page;",
  "    page-break-before: always;",
  "  }",
  "  .uscistr-root .uscistr-print-section { margin-bottom: var(--ust-s6); }",
  // Indent and hairline left border, matching how .uscistr-rec-group-body
  // shows nesting on screen.
  "  .uscistr-root .uscistr-print-group {",
  "    margin-left: 5px;",
  "    padding-left: var(--ust-s4);",
  "    border-left: 1px solid #CCCCCC;",
  "  }",
  "  .uscistr-root .uscistr-print-foot {",
  "    margin-top: var(--ust-s8);",
  "    padding-top: var(--ust-s4);",
  "    border-top: 1px solid #000000;",
  "    font-size: var(--ust-fs-doc-meta);",
  "    line-height: var(--ust-lh-doc-meta);",
  "    color: #767676;",
  "  }",

  // my.uscis.gov ships its own @media print rules: `a[href]::after { content:
  // " (" attr(href) ")"; }` and `img { display: none !important; }`. The
  // document is built with no anchors and no images by design; these rules
  // make that a guarantee rather than a convention, since a host rule we do
  // not control would otherwise splatter raw URLs into a printed
  // immigration record.
  "  .uscistr-root .uscistr-print a[href]::after { content: none !important; }",
  "  .uscistr-root .uscistr-print img { display: none; }",
  "}",
  "@page { margin: 14mm 12mm; }"
].join('\n');

// ============================================================================
// CaseLens — core (USCIS case tracker)
// ============================================================================
//
// PRIVACY CONTRACT (the whole point of this file being readable):
//   - Runs only on my.uscis.gov and talks ONLY to these same-origin endpoints:
//       1. https://my.uscis.gov/account/case-service/api/cases                     (auth probe)
//       2. https://my.uscis.gov/account/case-service/api/cases/{num}               (case detail + events)
//       3. https://my.uscis.gov/account/case-service/api/case_status/{num}         (status + history + office)
//       4. https://my.uscis.gov/account/case-service/api/cases/{num}/documents     (documents)
//       5. https://my.uscis.gov/account/case-service/api/cases/{FORM}/processing_times/{num}
//       6. https://my.uscis.gov/secure-messaging/api/case-service/receipt_info/{num} (extra location)
//     Every URL the code can build lives in ENDPOINTS below — there is no other
//     place a network address appears. Endpoints 5 and 6 are frequently empty;
//     see docs/API-SCHEMA.md for schemas verified against a live account.
//   - Auth = your existing browser session cookies. No passwords, no tokens stored.
//   - Everything you save (case numbers, labels, history) lives in this
//     browser's localStorage under keys prefixed "uscisTracker.". Nothing is
//     ever sent anywhere else. No analytics, no telemetry, no third parties.
//   - No eval, no innerHTML: all DOM is built with createElement/textContent.
//
// This file is the single source of truth. The userscript and the Chrome and
// Firefox extensions are generated from it and core/uscis-codes.js — verify with
// `node scripts/build.js --check`.
// ============================================================================

(function () {
  'use strict';

  if (window.__uscisTrackerInjected) return;
  window.__uscisTrackerInjected = true;

  // ==========================================================================
  // SECTION 1: Constants
  // ==========================================================================

  var VERSION = '1.20.0';

  var STORAGE_KEYS = {
    cases: 'uscisTracker.cases.v1',      // [{ number, label, addedAt }]
    snapshots: 'uscisTracker.snapshots.v1', // { [number]: SNAPSHOT (see normalize) }
    history: 'uscisTracker.history.v1',  // { [number]: [{ at, kind, from, to }] } newest-first
    prefs: 'uscisTracker.prefs.v1',      // { panelPos, collapsed, dark, refreshMs, notify, redact }
    // { v: 2, byCode: { "CODE|FORM": { text, from: receiptNumber } } } learned
    // from your own cases. See learnCodeText() for why the key carries the
    // form type and the value remembers which case the wording came from.
    codeText: 'uscisTracker.codeText.v1',
    // Receipt numbers the user explicitly removed. Auto-discovery reads the
    // account page on every load, so without this a removed case reappears on
    // the next refresh and Remove looks broken.
    dismissed: 'uscisTracker.dismissed.v1'
  };

  // One shape, stated once: a receipt number is three letters and ten digits.
  // There used to be three of these, and two disagreed — the add-case form
  // accepted only IOE while import accepted any prefix, so someone holding a
  // paper-filed EAC receipt was shown the correct rule and then an error for
  // following it.
  var CASE_NUMBER_RE = /^[A-Z]{3}[0-9]{10}$/i;
  // Cases these endpoints can actually reach. Other prefixes are real receipt
  // numbers filed on paper, which this account API does not serve.
  var ONLINE_PREFIX_RE = /^IOE/i;
  // Scraping the account page. Deliberately narrower than CASE_NUMBER_RE:
  // discovery adds cases without being asked, so it only claims the prefix
  // these endpoints can actually serve. A looser pattern here would auto-add
  // paper-filed cases that can only ever fail to load.
  var RECEIPT_NUMBER_RE = /\b(IOE[0-9]{10})\b/g;
  var DEFAULT_FORM_TYPE = 'I-765';
  var HISTORY_CAP = 200;
  // Ceiling on cases added automatically from the page. Manual adds are not
  // capped: someone who types a receipt number meant it.
  var MAX_TRACKED_CASES = 25;
  var MIN_REFRESH_MS = 5 * 60 * 1000;
  var DEFAULT_REFRESH_MS = 15 * 60 * 1000;
  var STAGGER_MS = 300;

  var BASE = 'https://my.uscis.gov';

  // Case numbers and form types are interpolated into paths, and a user may
  // type anything into the add-case box. Encoding here means no input can
  // escape its path segment or reshape the URL, for every endpoint at once.
  function seg(value) {
    return encodeURIComponent(String(value === null || value === undefined ? '' : value));
  }

  var ENDPOINTS = {
    caseList: function () { return BASE + '/account/case-service/api/cases'; },
    caseDetail: function (n) { return BASE + '/account/case-service/api/cases/' + seg(n); },
    location: function (n) { return BASE + '/secure-messaging/api/case-service/receipt_info/' + seg(n); },
    caseStatus: function (n) { return BASE + '/account/case-service/api/case_status/' + seg(n); },
    processingTimes: function (n, form) { return BASE + '/account/case-service/api/cases/' + seg(form) + '/processing_times/' + seg(n); },
    documents: function (n) { return BASE + '/account/case-service/api/cases/' + seg(n) + '/documents'; }
  };

  // --------------------------------------------------------------------------
  // DATA MODEL — the single place that records which response fields we read.
  //
  // Verified against a live account (see docs/API-SCHEMA.md). The first key in
  // each list is what the API actually returned; the rest are defensive
  // fallbacks kept because these endpoints are undocumented and may change.
  // Every extraction in sections 4 and 5 reads from this map — no other
  // function embeds its own field names.
  // --------------------------------------------------------------------------
  var FIELDS = {
    // GET /api/cases/{num} — case detail. Arrays: events, notices, documents.
    caseDetail: {
      receiptNumber: ['receiptNumber', 'caseNumber'],
      formType: ['formType', 'formNumber', 'form', 'caseType'],
      formName: ['formName', 'formTitle'],
      submissionDate: ['submissionTimestamp', 'submissionDate', 'filedDate'],
      // When USCIS last touched the record — moves even when the public
      // status does not. This powers the "backend activity" signal.
      updatedAt: ['updatedAtTimestamp', 'updatedAt', 'lastUpdatedDate', 'modifyDate'],
      closed: ['closed'],
      actionRequired: ['actionRequired'],
      premium: ['isPremiumProcessed'],
      representativeName: ['representativeName'],
      events: ['events'],
      notices: ['notices'],
      evidenceRequests: ['evidenceRequests']
    },
    // GET /api/case_status/{num} — richest endpoint: status text, office, history.
    caseStatus: {
      receiptNumber: ['receiptNumber', 'caseNumber'],
      status: ['statusTitle', 'status', 'statusText', 'currentStatus'],
      statusDetail: ['statusText', 'description', 'statusDescription'],
      // USCIS ships its own Spanish translations in the same payload.
      statusSpanish: ['statusTitleSpanish'],
      statusDetailSpanish: ['statusTextSpanish'],
      actionCode: ['currentActionCode'],
      actionCodeDate: ['currentActionCodeDate'],
      formType: ['formType', 'formNumber'],
      office: ['jurisdictionDescription', 'jurisdiction'],
      officeCode: ['jurisdiction'],
      history: ['historicalCaseStatuses'],
    },
    // Entries inside caseStatus.history[]
    historyItem: {
      date: ['date'],
      actionCode: ['actionCode'],
      text: ['statusTitle', 'description', 'text'],
      textSpanish: ['statusTitleSpanish']
    },
    // Entries inside caseDetail.events[]
    eventItem: {
      code: ['eventCode'],
      date: ['eventTimestamp', 'eventDateTime', 'createdAtTimestamp', 'createdAt']
    },
    // Entries inside caseDetail.notices[]
    noticeItem: {
      type: ['actionType'],
      generatedAt: ['generationDate'],
      appointmentAt: ['appointmentDateTime'],
      letterId: ['letterId']
    },
    // GET /api/cases/{num}/documents — array of these.
    documentItem: {
      name: ['fileName', 'name', 'title', 'documentName'],
      date: ['createDate', 'date', 'postedDate', 'createdDate'],
      type: ['type'],
      source: ['sourceType'],
      url: ['url', 'downloadUrl', 'href']
    },
    // GET /secure-messaging/.../receipt_info/{num} — usually null.
    location: {
      office: ['office', 'fieldOffice', 'serviceCenter', 'location'],
      address: ['address', 'officeAddress']
    },
    // GET /api/cases/{FORM}/processing_times/{num} — usually HTTP 204 empty.
    processingTimes: {
      estimate: ['estimatedTimeframe', 'processingTime', 'rangeText', 'formattedRange'],
      medianDays: ['medianProcessingTime', 'medianDays']
    }
  };

  // Event-code meanings now come from core/uscis-codes.js (the NIEM federal
  // schema, 492 codes) plus wording learned from the user's own cases.
  // See describeCode().

  var DEFAULT_PREFS = {
    panelPos: null,
    collapsed: true,
    dark: false,
    refreshMs: DEFAULT_REFRESH_MS,
    notify: false,
    redact: false,
    seenIntro: false
  };

  // Mutable app state (not persisted except via the storage layer)
  var state = {
    cases: [],            // [{ number, label, addedAt, result: null|{...}, loading: false, changedSince: false }]
    sessionExpired: false,
    // This browser refused a write and a detected change was lost with it.
    // Surfaced by buildStorageBanner(); never cleared silently.
    storageBlocked: false,
    authenticated: false,
    discoveredCases: null, // from auth probe, for "Import my cases"
    prefs: null
  };

  // ==========================================================================
  // SECTION 2: Storage
  // ==========================================================================
  // load(key, fallback) / save(key, value): JSON localStorage wrappers, try/caught.
  // loadAll(): populate state.cases (+ merge default prefs).
  // persistCases(), persistPrefs(), getSnapshot(n), setSnapshot(n, snap),
  // getHistory(n), appendHistory(n, entries) — trims to HISTORY_CAP.

  // Parsed values, keyed by storage key, so one render pass parses each store
  // once instead of once per case per code.
  //
  // Measured before this existed: a single render of four cases performed 47
  // localStorage reads — each a full JSON.parse — of which 26 re-parsed the
  // same learned-wording dictionary, because describeCode() reloads it for
  // every event code on every row.
  //
  // This is a memo, not a cache in the persistence sense: every write clears
  // it, so a read after a write always sees the write. Nothing may be held
  // across a write, which is the only way a cache like this goes wrong.
  var readMemo = Object.create(null);

  function invalidateReadMemo(key) {
    if (key === undefined) readMemo = Object.create(null);
    else delete readMemo[key];
  }

  // Read a JSON value from localStorage. Falls back to `fallback` whenever the
  // key is missing, the stored text isn't valid JSON, or the parsed value's
  // shape doesn't match what the caller expects (array vs. plain object).
  function load(key, fallback) {
    // Only a successful parse is memoized. A miss returns the caller's own
    // fallback, and callers pass different fallbacks for the same key.
    if (readMemo[key] !== undefined) return readMemo[key];

    var raw = null;
    try {
      raw = localStorage.getItem(key);
      if (raw === null) return fallback;

      var parsed = JSON.parse(raw);

      if (Array.isArray(fallback)) {
        if (Array.isArray(parsed)) { readMemo[key] = parsed; return parsed; }
        rescueUnreadable(key, raw);
        return fallback;
      }
      if (fallback !== null && typeof fallback === 'object') {
        var isPlainObject = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed);
        if (isPlainObject) { readMemo[key] = parsed; return parsed; }
        rescueUnreadable(key, raw);
        return fallback;
      }
      // Deliberately NOT memoized. A scalar/null fallback has no shape check,
      // so caching here would let a later caller with an object fallback take a
      // memo hit and skip both the check and rescueUnreadable — silently
      // bypassing the rescue for exactly the keys it exists to protect.
      return parsed;
    } catch (e) {
      rescueUnreadable(key, raw);
      return fallback;
    }
  }

  // Data that cannot be rebuilt if we throw it away. Everything USCIS sends is
  // re-fetchable and every learned label re-derivable, but the change history
  // is this panel's own observation of what moved and when — if a future
  // version reads it with a different shape in mind, load()'s type check would
  // quietly hand back an empty object and the record would be gone. So an
  // unusable value is copied aside before the default is used, and never
  // overwritten in place.
  var IRREPLACEABLE_KEYS = {};
  IRREPLACEABLE_KEYS['uscisTracker.history.v1'] = true;
  IRREPLACEABLE_KEYS['uscisTracker.cases.v1'] = true;

  // Where those rescue copies land. Named once so removal and erasure can find
  // them — they are invisible to the user and easy to forget.
  var RESCUE_KEYS = [
    'uscisTracker.history.v1.unreadable',
    'uscisTracker.cases.v1.unreadable'
  ];

  function rescueUnreadable(key, raw) {
    if (!IRREPLACEABLE_KEYS[key] || !raw) return;
    var backup = key + '.unreadable';
    try {
      // Keep the first copy: a later bad write must not overwrite the good
      // data rescued from the first one.
      if (localStorage.getItem(backup) === null) localStorage.setItem(backup, raw);
    } catch (e) {
      // Storage full or unavailable. Nothing further we can do, and the
      // original value is still in place under its own key.
    }
  }

  // Write a JSON value to localStorage. Swallows errors (quota exceeded,
  // storage disabled in private browsing, etc.) so a save never crashes the app.
  // A refused write is reported through state.storageBlocked, set where the
  // loss actually matters (applyFetchResult, when a detected change cannot be
  // recorded). There was a second flag here that nothing ever read — an
  // auditor tracing the storage-failure path had to work out which of two
  // mattered.

  function save(key, value) {
    // Before the write, not after: if setItem throws, the memo must not still
    // be holding a value the caller has already mutated in place.
    invalidateReadMemo(key);
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      // Quota exceeded, or storage disabled in private browsing. Report it so
      // callers can avoid acting on a write that did not happen — see
      // applyFetchResult, where a lost snapshot would otherwise make the same
      // change be re-detected and re-notified on every refresh, forever.
      return false;
    }
  }


  // One shape for a tracked case, built in one place.
  //
  // There were three constructions of this object — loadAll, addCase, and
  // auto-discovery — and they had already drifted: two omitted lastLookedAt,
  // which buildChangeBand reads. A field added to one and not the others is
  // how the next drift happens.
  //
  // `result` and `loading` describe this page view and are never persisted;
  // persistCases() decides what is written.
  function makeCaseEntry(fields) {
    return {
      number: fields.number,
      label: typeof fields.label === 'string' ? fields.label : '',
      addedAt: fields.addedAt || new Date().toISOString(),
      changedSince: fields.changedSince === true,
      lastLookedAt: typeof fields.lastLookedAt === 'string' ? fields.lastLookedAt : null,
      result: null,
      loading: false
    };
  }

  // Populate state.cases and state.prefs from localStorage. Safe to call
  // multiple times; always rebuilds both from scratch.
  function loadAll() {
    var storedCases = load(STORAGE_KEYS.cases, []);
    state.cases = [];
    for (var i = 0; i < storedCases.length; i++) {
      var c = storedCases[i];
      // The same validation import applies. These paths read the same store, so
      // accepting anything truthy here made the stricter check on import
      // decorative: a value that could not be imported could still be loaded.
      if (!c || typeof c !== 'object' || !isValidReceiptNumber(c.number)) continue;
      // changedSince survives the reload that stored it; only the reader
      // dismissing it, or a later check finding nothing new, clears it.
      state.cases.push(makeCaseEntry(c));
    }

    var storedPrefs = load(STORAGE_KEYS.prefs, {});
    var prefs = {};
    var key;
    for (key in DEFAULT_PREFS) {
      if (DEFAULT_PREFS.hasOwnProperty(key)) prefs[key] = DEFAULT_PREFS[key];
    }
    for (key in storedPrefs) {
      if (storedPrefs.hasOwnProperty(key)) prefs[key] = storedPrefs[key];
    }

    if (typeof prefs.refreshMs !== 'number' || isNaN(prefs.refreshMs)) {
      prefs.refreshMs = DEFAULT_REFRESH_MS;
    }
    if (prefs.refreshMs < MIN_REFRESH_MS) {
      prefs.refreshMs = MIN_REFRESH_MS;
    }

    state.prefs = prefs;
  }

  // Save state.cases back to localStorage, stripping the fields that only mean
  // something while the page is open (result, loading).
  //
  // changedSince is kept. It used to be dropped, which quietly lost the one
  // answer this tool exists to give: the change fires, the snapshot advances to
  // match, and if the tab closes before the reader marks it seen, the next
  // fetch diffs against the already-updated snapshot, finds nothing, and the
  // marker is gone for good. It is cleared when the reader dismisses it, which
  // is the only thing that should clear it.
  function persistCases() {
    var toSave = [];
    for (var i = 0; i < state.cases.length; i++) {
      var c = state.cases[i];
      toSave.push({
        number: c.number, label: c.label, addedAt: c.addedAt,
        changedSince: !!c.changedSince,
        lastLookedAt: c.lastLookedAt || null
      });
    }
    save(STORAGE_KEYS.cases, toSave);
  }

  function persistPrefs() {
    save(STORAGE_KEYS.prefs, state.prefs);
  }

  function getSnapshot(number) {
    var snapshots = load(STORAGE_KEYS.snapshots, {});
    return migrateSnapshot(snapshots[number] || null);
  }

  // Snapshots written before the status date was renamed still carry it as
  // `lastUpdated`, which was ambiguous with the record's own updated-at stamp.
  // Read the old key when the new one is absent: dropping it would blank the
  // status date on every existing install and make the next diff report a
  // change that never happened.
  function migrateSnapshot(snap) {
    if (snap && snap.statusAt === undefined && snap.lastUpdated !== undefined) {
      snap.statusAt = snap.lastUpdated;
    }
    return snap;
  }

  function setSnapshot(number, snap) {
    var snapshots = load(STORAGE_KEYS.snapshots, {});
    snapshots[number] = snap;
    return save(STORAGE_KEYS.snapshots, snapshots);
  }

  // History is stored newest-first, per case number.
  function getHistory(number) {
    var all = load(STORAGE_KEYS.history, {});
    return Array.isArray(all[number]) ? all[number] : [];
  }

  // Prepend new entries (already newest-first among themselves) to the
  // existing history for this case, then trim to HISTORY_CAP entries.
  function appendHistory(number, entries) {
    if (!entries || !entries.length) return;
    var all = load(STORAGE_KEYS.history, {});
    var existing = Array.isArray(all[number]) ? all[number] : [];
    var combined = entries.concat(existing);
    if (combined.length > HISTORY_CAP) {
      combined = combined.slice(0, HISTORY_CAP);
    }
    all[number] = combined;
    save(STORAGE_KEYS.history, all);
  }

  // ==========================================================================
  // SECTION 3: Fetch layer
  // ==========================================================================
  // fetchJSON(url) -> Promise<object|{__error, __auth?}>  (never rejects)
  //   401/403 -> { __error, __auth: true }; 404 -> friendly message; other
  //   non-OK -> HTTP code message; network error -> message.
  // sleep(ms)
  // checkAuthenticated() -> Promise<{ authenticated: bool, caseList: array|null }>
  //   GET ENDPOINTS.caseList(); authenticated iff res.ok AND content-type json
  //   AND res.url doesn't look like a sign-in redirect. Stores discovered case
  //   list when the response contains one.
  // guessFormType(caseDetailData) -> string (candidate keys, DEFAULT_FORM_TYPE fallback)
  // fetchAllForCase(number) -> Promise<result>
  //   caseDetail first, then location/caseStatus/processingTimes/documents
  //   SEQUENTIALLY with STAGGER_MS between calls. Result:
  //   { fetchedAt, formTypeUsed, caseDetail, location, caseStatus, processingTimes, documents }
  //   Sets state.sessionExpired if any __auth.

  // GET a URL with the browser's existing session cookies and parse the JSON
  // body. Never rejects — every failure mode (auth, 404, other HTTP error,
  // bad JSON, network failure) resolves to a plain { __error } object so
  // callers never need try/catch.
  function fetchJSON(url) {
    return fetch(url, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' }
    }).then(function (res) {
      if (res.status === 401 || res.status === 403) {
        return { __error: 'Not logged in to my.uscis.gov (or session expired).', __auth: true };
      }
      if (res.status === 404) {
        return { __error: 'No data at this endpoint for this case.' };
      }
      // 204 No Content is USCIS's normal answer for "we have no data here" —
      // the processing-times endpoint returns it constantly. Not an error.
      if (res.status === 204) {
        return { __empty: true };
      }
      if (!res.ok) {
        return { __error: 'Request failed (HTTP ' + res.status + ').' };
      }
      return res.text().then(function (text) {
        if (!text) return { __empty: true };
        var parsed;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          return { __error: 'Response was not valid JSON.' };
        }
        return unwrapEnvelope(parsed);
      });
    }).catch(function (err) {
      var message = (err && err.message) ? err.message : String(err);
      return { __error: 'Network error: ' + message };
    });
  }

  // Every my.uscis.gov endpoint wraps its payload in { "data": ... }. Unwrap it
  // once here so the rest of the code never thinks about the envelope. A null
  // payload (which the location endpoint returns routinely) becomes __empty.
  function unwrapEnvelope(parsed) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return parsed;
    if (!Object.prototype.hasOwnProperty.call(parsed, 'data')) return parsed;

    var inner = parsed.data;
    if (inner === null || inner === undefined) return { __empty: true };
    if (Array.isArray(inner)) return { __list: inner };
    if (typeof inner === 'object') return inner;
    // A scalar `data` (never observed). Treated as "answered, nothing usable"
    // rather than inventing a sentinel no caller reads.
    return { __empty: true };
  }

  // Endpoints that return a bare array arrive as { __list: [...] } from
  // unwrapEnvelope. This pulls the array back out for callers that want it.
  function asList(payload) {
    if (!payloadUsable(payload)) return null;
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.__list)) return payload.__list;
    return null;
  }


  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  // Probe the case-list endpoint to determine whether the user has an active
  // my.uscis.gov session. A sign-in redirect typically comes back as an HTML
  // page (wrong content-type) or a URL containing "sign" — either is treated
  // as "not authenticated" rather than an error. As a side effect, stashes
  // any case list found in the response for the auto-discovery flow.
  function checkAuthenticated() {
    return fetch(ENDPOINTS.caseList(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' }
    }).then(function (res) {
      var contentType = res.headers.get('content-type') || '';
      var url = res.url || '';
      var looksAuthenticated = res.ok && contentType.indexOf('json') !== -1 && url.indexOf('sign') === -1;

      if (!looksAuthenticated) {
        return { authenticated: false };
      }

      // The body is only a bonus: on a real account this endpoint returns an
      // empty list even when cases exist, so discovery does not depend on it
      // (see discoverFromPage). A JSON 200 is all we need to know we're in.
      return res.text().then(function (text) {
        try {
          var data = JSON.parse(text);
          var list = null;
          if (Array.isArray(data)) list = data;
          else if (data && Array.isArray(data.data)) list = data.data;
          else if (data && Array.isArray(data.cases)) list = data.cases;
          if (list && list.length) state.discoveredCases = list;
        } catch (e) {
          // Authenticated, but the body wasn't JSON we can use for discovery.
        }
        return { authenticated: true };
      });
    }).catch(function () {
      return { authenticated: false };
    });
  }

  // Best-effort guess at which form type to use for the processing-times
  // lookup, since that endpoint needs a form number in its URL.
  function guessFormType(caseDetailData) {
    if (!caseDetailData || caseDetailData.__error) return DEFAULT_FORM_TYPE;
    var value = pick(caseDetailData, FIELDS.caseDetail.formType);
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    return DEFAULT_FORM_TYPE;
  }

  // Read receipt numbers straight out of the account page, which server-renders
  // them as "Receipt # IOE#########". This is how auto-discovery actually works:
  // the case-list endpoint returns an empty array even for accounts with active
  // cases. Costs no network request at all.
  function discoverFromPage() {
    var found = [];
    var seen = {};
    var text = '';
    try {
      text = document.body ? (document.body.innerText || document.body.textContent || '') : '';
    } catch (e) {
      return found;
    }

    RECEIPT_NUMBER_RE.lastIndex = 0;
    var match = RECEIPT_NUMBER_RE.exec(text);
    while (match !== null) {
      var number = match[1].toUpperCase();
      if (!seen[number]) {
        seen[number] = true;
        found.push({ number: number, label: '' });
      }
      match = RECEIPT_NUMBER_RE.exec(text);
    }
    return found;
  }

  // Fetch every endpoint for one case, strictly one at a time (never in
  // parallel) with a short pause between requests so we don't hammer an
  // undocumented API. caseDetail goes first because its form type feeds the
  // processing-times URL.
  function fetchAllForCase(number) {
    var result = {
      // When the attempt started. NOT evidence that anything was learned —
      // succeededAt is set below only if at least one endpoint answered.
      fetchedAt: new Date().toISOString(),
      succeededAt: null,
      formTypeUsed: DEFAULT_FORM_TYPE,
      caseDetail: null,
      location: null,
      caseStatus: null,
      processingTimes: null,
      documents: null
    };

    return fetchJSON(ENDPOINTS.caseDetail(number))
      .then(function (caseDetail) {
        result.caseDetail = caseDetail;
        result.formTypeUsed = guessFormType(caseDetail);
        return sleep(STAGGER_MS);
      })
      .then(function () {
        return fetchJSON(ENDPOINTS.location(number));
      })
      .then(function (location) {
        result.location = location;
        return sleep(STAGGER_MS);
      })
      .then(function () {
        return fetchJSON(ENDPOINTS.caseStatus(number));
      })
      .then(function (caseStatus) {
        result.caseStatus = caseStatus;
        return sleep(STAGGER_MS);
      })
      .then(function () {
        return fetchJSON(ENDPOINTS.processingTimes(number, result.formTypeUsed));
      })
      .then(function (processingTimes) {
        result.processingTimes = processingTimes;
        return sleep(STAGGER_MS);
      })
      .then(function () {
        return fetchJSON(ENDPOINTS.documents(number));
      })
      .then(function (documents) {
        result.documents = documents;

        var parts = [
          result.caseDetail, result.location,
          result.caseStatus, result.processingTimes, result.documents
        ];
        var anyAuthError = false;
        for (var i = 0; i < parts.length; i++) {
          if (parts[i] && parts[i].__auth) {
            anyAuthError = true;
            break;
          }
        }
        state.sessionExpired = anyAuthError;
        if (resultHasAnyData(result)) result.succeededAt = new Date().toISOString();

        return result;
      });
  }

  // Every case we can find for this user, deduped: receipt numbers scraped
  // from the account page (the reliable source) plus anything the case-list
  // endpoint happened to return (usually nothing).
  function discoveredCaseNumbers() {
    var out = [];
    var seen = {};

    function add(number, label) {
      if (!number || !/^[A-Z]{3}[0-9]{10}$/.test(number)) return;
      if (seen[number]) return;
      seen[number] = true;
      out.push({ number: number, label: label || '' });
    }

    var fromPage = discoverFromPage();
    for (var p = 0; p < fromPage.length; p++) {
      add(fromPage[p].number, fromPage[p].label);
    }

    var list = state.discoveredCases;
    if (!Array.isArray(list)) return out;

    var numberKeys = ['receiptNumber', 'caseNumber', 'number', 'receipt_number'];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      if (!item || typeof item !== 'object') continue;

      var number = null;
      for (var k = 0; k < numberKeys.length; k++) {
        var candidate = item[numberKeys[k]];
        if (typeof candidate === 'string' && candidate.trim()) {
          number = candidate.trim().toUpperCase();
          break;
        }
      }

      var label = pick(item, FIELDS.caseDetail.formType);
      add(number, typeof label === 'string' ? label.trim() : '');
    }

    return out;
  }

  // ==========================================================================
  // SECTION 4: Normalize + diff
  // ==========================================================================
  // pick(obj, keys) -> first non-empty candidate value or null
  // normalize(result) -> snapshot { at, status, statusAt, backendAt, office, docNames (sorted),
  //                              formType, formName, submissionDate, actionCode,
  //                              closed, actionRequired, evidenceCount, appointments }
  // diffSnapshots(prev, next) -> [{ at, kind, from, to }]  (empty if prev falsy)
  // applyFetchResult(entry, result): normalize, diff vs stored snapshot, append
  //   history, set entry.changedSince on changes, store new snapshot, maybeNotify.
  // maybeNotify(entry, changes): Notification only if prefs.notify && permission granted.

  // A receipt number we are willing to store and put into a request URL.
  // Backup files are user-supplied and may be corrupt or hostile, so anything
  // that isn't three letters plus ten digits is rejected outright.
  function isValidReceiptNumber(value) {
    return typeof value === 'string' && CASE_NUMBER_RE.test(value);
  }

  // Look through `keys` in order and return the first value on `obj` that
  // isn't undefined, null, or ''. Returns null if none match or obj isn't an
  // object — this is the one place we absorb "the API renamed a field again".
  function pick(obj, keys) {
    if (!obj || typeof obj !== 'object') return null;
    for (var i = 0; i < keys.length; i++) {
      var value = obj[keys[i]];
      if (value !== undefined && value !== null && value !== '') return value;
    }
    return null;
  }

  // JSON.stringify that never throws (e.g. on a circular structure from a
  // misbehaving endpoint). Used only as a last-resort display fallback.
  function safeStringify(obj) {
    try {
      return JSON.stringify(obj);
    } catch (e) {
      return null;
    }
  }

  // Reduce a raw fetchAllForCase() result down to the small set of fields we
  // actually compare across refreshes to detect change.
  function normalize(result) {
    var snap = {
      at: (result && result.fetchedAt) || null,
      status: null,        // official status title, e.g. "Case Was Received"
      actionCode: null,    // e.g. "FTA0"
      statusAt: null,   // date attached to the public status
      backendAt: null,     // when USCIS last touched the record (may be newer)
      office: null,
      docNames: [],
      // Stable facts about the case, kept so a card can still be rendered
      // from cache when a later fetch fails. Neither changes over a case's
      // life, so showing them from cache states nothing that stopped being true.
      formName: null,
      submissionDate: null,
      // Only ever the form type USCIS actually reported. result.formTypeUsed
      // may be DEFAULT_FORM_TYPE, which exists to build a URL — recording it
      // here would turn a fallback into a stated fact about the case.
      formType: null,
      // What this case is asking of the person, and whether it is over.
      // Stored because every collapsed row states these, and until they were
      // stored a single dropped request silently deleted an appointment from
      // the row — the one line collapse-all depends on being unmissable.
      // Cached values are shown dated and marked stale, never as current.
      closed: null,
      actionRequired: null,
      evidenceCount: 0,
      appointments: []     // [{ label, at }], future-dated when recorded
    };
    if (!result) return snap;

    // flattenValue, not String: these come from an undocumented API that has
    // already been observed returning an object where a string was expected.
    // String({}) is "[object Object]", which the differ would compare against
    // the previous status, call a change, and push to the OS notification
    // centre — a fabricated status change from a schema wobble.
    var observedForm = pick(result.caseDetail, FIELDS.caseDetail.formType);
    if (observedForm === null) {
      observedForm = pick(result.caseStatus, FIELDS.caseStatus.formType);
    }
    snap.formType = flattenValue(observedForm);
    snap.formName = flattenValue(pick(result.caseDetail, FIELDS.caseDetail.formName));
    snap.submissionDate = flattenValue(pick(result.caseDetail, FIELDS.caseDetail.submissionDate));

    // Status and office come from the case_status endpoint, which carries the
    // official wording, the action code, and the jurisdiction.
    var notice = result.caseStatus;
    if (payloadUsable(notice)) {
      var statusValue = flattenValue(pick(notice, FIELDS.caseStatus.status));
      snap.status = statusValue !== null ? stripHtml(statusValue) : null;
      snap.actionCode = flattenValue(pick(notice, FIELDS.caseStatus.actionCode));

      snap.statusAt = pick(notice, FIELDS.caseStatus.actionCodeDate);
      snap.office = flattenValue(pick(notice, FIELDS.caseStatus.office));
    }

    // The case-detail endpoint carries the record's own updated-at stamp, which
    // moves when USCIS works a case even if the public status is unchanged.
    var caseDetail = result.caseDetail;
    if (payloadUsable(caseDetail)) {
      snap.backendAt = pick(caseDetail, FIELDS.caseDetail.updatedAt);
      if (snap.statusAt === null) {
        snap.statusAt = snap.backendAt;
      }

      // Only ever a real boolean from USCIS. A missing field stays null so a
      // cached card can distinguish "USCIS said this case is open" from
      // "we never learned either way".
      snap.closed = strictBool(pick(caseDetail, FIELDS.caseDetail.closed));
      snap.actionRequired = strictBool(pick(caseDetail, FIELDS.caseDetail.actionRequired));

      var evidence = pick(caseDetail, FIELDS.caseDetail.evidenceRequests);
      snap.evidenceCount = Array.isArray(evidence) ? evidence.length : 0;
      snap.appointments = futureAppointments(caseDetail);
    }

    // Fall back to the secondary location endpoint only if jurisdiction was absent.
    if (snap.office === null) {
      var location = result.location;
      if (payloadUsable(location)) {
        snap.office = flattenValue(pick(location, FIELDS.location.office));
      }
    }

    var docList = documentList(result.documents);
    if (docList) {
      var names = [];
      for (var i = 0; i < docList.length; i++) {
        var name = pick(docList[i], FIELDS.documentItem.name);
        if (name !== null) names.push(String(name));
      }
      names.sort();
      snap.docNames = names;
    }

    return snap;
  }

  // One level deep, which is all any caller here needs. Used where a render
  // decision has to be attached to an item without mutating the shared one.
  function shallowCopy(obj) {
    var out = {};
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
    }
    return out;
  }

  // Did this value actually carry a time, or only a date? A date-only value
  // parses to local midnight, which is indistinguishable from a real midnight
  // once it is a number — so the question has to be asked of the original
  // string, before it is parsed.
  function hasTimeComponent(value) {
    if (typeof value !== 'string') return false;
    if (!/[T ]\d{2}:\d{2}/.test(value)) return false;
    // Midnight UTC is how USCIS spells a bare date; see parseUscisDate.
    return !/^\d{4}-\d{2}-\d{2}(?:[T ]00:00(?::00(?:\.0+)?)?(?:Z|[+-]00:?00)?)?$/.test(value);
  }

  // true and false are facts about a case; anything else is an absence.
  // Coercing a missing field to false would let a card state "not closed"
  // on the strength of USCIS not having mentioned it.
  function strictBool(value) {
    return value === true || value === false ? value : null;
  }

  // Appointments that had not happened yet when this snapshot was taken.
  // Recorded so a collapsed row can still show a booked biometrics date after
  // a failed refresh; the row dates anything it draws from cache.
  function futureAppointments(caseDetail) {
    var out = [];
    var notices = pick(caseDetail, FIELDS.caseDetail.notices);
    if (!Array.isArray(notices)) return out;
    var now = new Date().getTime();
    for (var i = 0; i < notices.length; i++) {
      var at = pick(notices[i], FIELDS.noticeItem.appointmentAt);
      if (!at) continue;
      var ms = parseUscisDate(at);
      if (ms === null || ms <= now) continue;
      out.push({ label: flattenValue(pick(notices[i], FIELDS.noticeItem.type)), at: ms });
    }
    out.sort(function (a, b) { return a.at - b.at; });
    return out;
  }

  // Documents arrive as a bare array inside the data envelope.
  function documentList(documents) {
    if (!payloadUsable(documents)) return null;
    var list = asList(documents);
    if (list) return list;
    if (Array.isArray(documents.documents)) return documents.documents;
    return null;
  }

  // Reduce an unknown value (string, number, or nested object) to a display
  // string, preferring a human-looking name when handed an object.
  function flattenValue(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') {
      var name = pick(value, ['name', 'description', 'title']);
      return name !== null ? String(name) : safeStringify(value);
    }
    return String(value);
  }

  // USCIS status prose embeds real HTML anchors. We never inject markup, so
  // tags are stripped to plain text before the value is used anywhere.
  function stripHtml(text) {
    if (typeof text !== 'string') return text;
    if (text.indexOf('<') === -1) return text;
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Compare two snapshots and describe what changed, for the local history
  // log and for notifications. Returns [] if there's no previous snapshot to
  // compare against (i.e. this is the first fetch for this case).
  function diffSnapshots(prev, next) {
    var changes = [];
    if (!prev) return changes;

    if (next.status !== null && String(next.status) !== String(prev.status)) {
      changes.push({ at: next.at, kind: 'status', from: prev.status, to: next.status });
    }

    // USCIS moved the record's updated-at stamp without changing the public
    // status: the case was worked on behind the scenes. The website never
    // surfaces this, so it is reported separately and never as a status change.
    if (next.backendAt !== null &&
        String(next.backendAt) !== String(prev.backendAt) &&
        String(next.status) === String(prev.status)) {
      changes.push({ at: next.at, kind: 'backend', from: prev.backendAt, to: next.backendAt });
    }

    // Counted, not set-membership: USCIS reuses filenames, and a second file
    // with a name we have already seen is still a new document on this case.
    var remaining = Object.create(null);
    var i;
    var name;
    if (Array.isArray(prev.docNames)) {
      for (i = 0; i < prev.docNames.length; i++) {
        name = prev.docNames[i];
        remaining[name] = (remaining[name] || 0) + 1;
      }
    }
    if (Array.isArray(next.docNames)) {
      for (i = 0; i < next.docNames.length; i++) {
        name = next.docNames[i];
        if (remaining[name]) {
          remaining[name] -= 1;
          continue;
        }
        changes.push({ at: next.at, kind: 'document', from: null, to: name });
      }
    }

    if (next.office !== null && String(next.office) !== String(prev.office)) {
      changes.push({ at: next.at, kind: 'office', from: prev.office, to: next.office });
    }

    return changes;
  }

  // After a fetch completes for a case entry: normalize the result, diff it
  // against the last stored snapshot, record any changes to history, flag
  // the entry so the UI can badge it, notify if enabled, then always store
  // the fresh snapshot (even when nothing changed).
  function applyFetchResult(entry, result) {
    entry.result = result;
    // New data for this case: any view built from the old result is stale, and
    // this runs outside render()'s own invalidation.
    invalidateCaseViews();

    // Learn USCIS's own wording for any action codes this response explains,
    // so bare codes on other cases can be labeled without guessing.
    learnCodeText(result);

    // If every endpoint failed we learned nothing about this case. Storing a
    // snapshot anyway would record defaults as if they were facts — the form
    // type falls back to DEFAULT_FORM_TYPE, and the timestamp would claim a
    // successful check that never happened. Keep the previous snapshot (or
    // none) and let the UI report the failure instead.
    if (!resultHasAnyData(result)) return;

    var snap = normalize(result);
    var prevSnap = getSnapshot(entry.number);

    carryForwardUnread(snap, prevSnap, result);

    // Every endpoint answered, and every one of them was empty. That tells us
    // nothing new about the case, and overwriting a snapshot that has real
    // content with this one would throw away the only copy the card can fall
    // back on — see caseContentSource()'s 'stale'.
    if (!snapshotHasContent(snap) && snapshotHasContent(prevSnap)) return;

    var changes = diffSnapshots(prevSnap, snap);

    // Order matters. If the snapshot write fails, the next refresh diffs
    // against the stale snapshot, re-detects the identical change, and
    // notifies again — every 15 minutes, forever. Only record the change once
    // the state it was measured against is actually stored.
    //
    // But returning here also skips appendHistory and the change marker, so a
    // real status change was detected, discarded, and never mentioned — in
    // private browsing or at quota, silently, which is the one failure this
    // tool must not hide. Say so instead.
    if (!setSnapshot(entry.number, snap)) {
      if (changes.length) state.storageBlocked = true;
      return;
    }

    if (changes.length) {
      appendHistory(entry.number, changes);
      entry.changedSince = true;
      // Persist the marker at the moment it is set. 1.7.0 added the field to
      // persistCases() and never called it here, so the fix was inert: the
      // snapshot advanced, the tab closed, and the next diff found nothing —
      // losing the one answer this tool exists to give.
      persistCases();
      maybeNotify(entry, changes);
    }
  }

  // Which endpoint supplies which snapshot field.
  //
  // `office` is deliberately absent: it has two sources (caseStatus's
  // jurisdiction, falling back to the location endpoint), and the "only if
  // still absent" rule below handles it correctly without needing to say which
  // one answered.
  var SNAPSHOT_SOURCES = [
    { key: 'caseDetail', fields: ['formType', 'formName', 'submissionDate', 'backendAt',
      'closed', 'actionRequired', 'evidenceCount', 'appointments'] },
    { key: 'caseStatus', fields: ['status', 'actionCode', 'statusAt'] },
    { key: 'documents', fields: ['docNames'] }
  ];

  // Keep what this check could not see, rather than recording it as absent.
  //
  // normalize() rebuilds every field from the current response, so one endpoint
  // failing used to blank everything it supplies. The damage landed on the NEXT
  // check: documents fails once, the stored list becomes empty, and when the
  // endpoint recovers all six documents diff against nothing and are reported
  // as new. The card reads "6 changes since you last looked", six rows go into
  // permanent history, and the OS notification fires — with nothing having
  // changed. The same path fabricated status and office changes, and wiped the
  // cached appointment that a failed check is supposed to be able to fall back
  // on.
  //
  // A value is only carried forward when this check did not supply one, so a
  // real change always wins and a genuinely emptied field (USCIS removing a
  // document) is still recorded as long as its own endpoint answered.
  function carryForwardUnread(snap, prevSnap, result) {
    if (!prevSnap) return;
    for (var i = 0; i < SNAPSHOT_SOURCES.length; i++) {
      var source = SNAPSHOT_SOURCES[i];
      if (payloadUsable(result[source.key])) continue;   // it answered; trust it
      for (var f = 0; f < source.fields.length; f++) {
        var field = source.fields[f];
        if (!isAbsentValue(snap[field]) || isAbsentValue(prevSnap[field])) continue;
        snap[field] = prevSnap[field];
      }
    }
    // Two sources, so it is handled by absence rather than by endpoint.
    if (snap.office === null && prevSnap.office) snap.office = prevSnap.office;
  }

  function isAbsentValue(value) {
    if (value === null || value === undefined) return true;
    if (Array.isArray(value)) return value.length === 0;
    return value === 0;   // evidenceCount
  }

  // How many entries at the head of `history` are newer than the one that was
  // previously newest. History is stored newest-first and capped, so at the cap
  // it stops growing and a length comparison always says zero.
  function countNewHistory(history, previousNewestAt, previousLength) {
    if (!history.length) return 0;
    if (previousNewestAt === null) return Math.min(history.length, history.length - previousLength) > 0
      ? history.length - previousLength : history.length;
    for (var i = 0; i < history.length; i++) {
      if (history[i].at === previousNewestAt) return i;
    }
    // The previous newest is gone — trimmed off the end, or the whole record
    // was replaced. Everything on screen is new to this reader.
    return history.length;
  }

  // A stored snapshot is only worth showing the user when it carries something
  // USCIS actually told us. An entry that exists but holds nothing is not a
  // record of the case, so it never counts as an earlier copy to fall back on.
  function snapshotHasContent(snap) {
    if (!snap) return false;
    if (snap.status || snap.statusAt || snap.backendAt || snap.office) return true;
    return !!(snap.docNames && snap.docNames.length);
  }

  // True when at least one endpoint returned usable data. An endpoint that
  // answered "nothing here" (__empty) counts as a real answer about the case;
  // an error does not.
  // Did this check actually learn anything about the case?
  //
  // Only the three endpoints that carry the case count. `location` and
  // `processingTimes` are supplementary and answer "nothing here" for almost
  // every case, so counting them made a check that read nothing at all look
  // like a success: with every endpoint returning `{"data": null}`, the header
  // said "4 cases · nothing new · checked just now" while the card underneath
  // said "USCIS returned no case data at all on this check". The reassuring
  // line is the one a person reads at 2am.
  //
  // "Answered with nothing" is still a real answer about a *field* — that
  // distinction is kept everywhere else. It is not a real answer about the
  // *case* when it is the only answer we got.
  function resultHasAnyData(result) {
    if (!result) return false;
    return payloadUsable(result.caseDetail) ||
      payloadUsable(result.caseStatus) ||
      payloadUsable(result.documents);
  }

  // Fire a browser Notification for the first detected change, but only if
  // the user opted in and the browser has already granted permission — we
  // never prompt for permission from here.
  function maybeNotify(entry, changes) {
    if (!state.prefs || !state.prefs.notify) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    if (!changes || !changes.length) return;

    // Backend activity is real but unexplainable: we know the record was
    // touched, not what it means. Interrupting someone for that — often at
    // night, often after months of waiting — presents as news when it isn't.
    // It stays visible in the panel and timeline, but never pushes on its own.
    var notifiable = null;
    for (var i = 0; i < changes.length; i++) {
      if (changes[i].kind !== 'backend') {
        notifiable = changes[i];
        break;
      }
    }
    if (!notifiable) return;

    try {
      // An OS notification is the one surface that persists outside the
      // browser — on a lock screen, in a notification centre, possibly mirrored
      // to another device. It has to honour "Hide receipt numbers" at least as
      // strictly as the panel does.
      var who = entry.label || displayNumber(entry.number);
      new Notification('USCIS case update', { body: who + ': ' + describeChange(notifiable) });
    } catch (e) {
      // Notification construction can throw in some contexts; never let a
      // notification failure break the refresh flow.
    }
  }

  // One sentence describing a detected change, used by notifications and the
  // timeline. Deliberately factual: it reports what moved, never what it means
  // for the case.
  function describeChange(change) {
    if (!change) return '';
    if (change.kind === 'status') {
      return 'Status changed to "' + change.to + '"';
    }
    if (change.kind === 'document') {
      return 'New document: ' + displayFileName(change.to);
    }
    if (change.kind === 'office') {
      return 'Office changed to ' + change.to;
    }
    if (change.kind === 'backend') {
      return 'USCIS updated this case record (status text unchanged)';
    }
    return 'Case updated';
  }

  // The learned-wording map's scope. USCIS writes different customer-facing wording
  // for the same action code on different forms — the same `IAF` is a receipt
  // notice on an I-485 and something else again on a Supplement J — so a map
  // keyed by code alone hands one case's sentence to another case's event.
  // Both halves of the key are required: a code we cannot attribute to a form
  // is not recorded at all.
  function learnedKey(code, formType) {
    if (!code || !formType) return null;
    return String(code).toUpperCase() + '|' + String(formType).toUpperCase();
  }

  // Shape-versioned because the v1 map was keyed by bare code. Those entries
  // cannot be attributed to a form now, and guessing would reintroduce exactly
  // the bleed this key change exists to stop, so an old map is dropped rather
  // than migrated: the next refresh re-learns it from the user's own cases.
  function loadLearned() {
    var stored = load(STORAGE_KEYS.codeText, {});
    if (!stored || stored.v !== 2 || !stored.byCode || typeof stored.byCode !== 'object') {
      return { v: 2, byCode: {} };
    }
    return stored;
  }

  // Record the official wording USCIS pairs with each action code, so bare
  // event codes elsewhere can be labeled in USCIS's own words rather than a
  // third party's guess. Stored locally like everything else.
  function learnCodeText(result) {
    if (!result) return;
    var notice = result.caseStatus;
    if (!payloadUsable(notice)) return;

    var formType = pick(notice, FIELDS.caseStatus.formType);
    if (formType === null) formType = pick(result.caseDetail, FIELDS.caseDetail.formType);
    var from = pick(notice, FIELDS.caseStatus.receiptNumber);
    if (from === null) from = pick(result.caseDetail, FIELDS.caseDetail.receiptNumber);

    var dict = loadLearned();
    var changed = false;

    function record(code, text) {
      var key = learnedKey(code, formType);
      if (!key || !text) return;
      var clean = stripHtml(String(text));
      if (!clean) return;
      var existing = dict.byCode[key];
      if (existing && existing.text === clean && existing.from === from) return;
      // `at` is only ever used to decide what to drop first when the map is
      // capped — never shown, never compared for equality above.
      dict.byCode[key] = {
        text: clean,
        from: from === null ? null : String(from),
        at: new Date().getTime()
      };
      changed = true;
    }

    record(pick(notice, FIELDS.caseStatus.actionCode), pick(notice, FIELDS.caseStatus.status));

    var history = pick(notice, FIELDS.caseStatus.history);
    if (Array.isArray(history)) {
      for (var i = 0; i < history.length; i++) {
        record(
          pick(history[i], FIELDS.historyItem.actionCode),
          pick(history[i], FIELDS.historyItem.text)
        );
      }
    }

    if (changed) {
      pruneLearned(dict);
      save(STORAGE_KEYS.codeText, dict);
    }
  }

  // Nothing ever removed an entry from this map. It only grows: one key per
  // code per form type, written on every refresh, for as long as the tool is
  // installed. Realistically that is dozens of keys, but "realistically" is
  // doing load-bearing work in a store with no ceiling — and a full quota
  // blocks the snapshot writes this tool actually depends on.
  //
  // Entries are dropped oldest-written first. Losing one costs nothing: the
  // next refresh of a case carrying that code writes it back.
  var LEARNED_CODE_CAP = 400;

  function pruneLearned(dict) {
    var keys = Object.keys(dict.byCode);
    if (keys.length <= LEARNED_CODE_CAP) return;
    keys.sort(function (a, b) {
      return (dict.byCode[a].at || 0) - (dict.byCode[b].at || 0);
    });
    for (var i = 0; i < keys.length - LEARNED_CODE_CAP; i++) delete dict.byCode[keys[i]];
  }

  // Translate an event code for display, in the caller's own case's context.
  // Returns the source alongside the text so the UI can say where the words
  // came from. The raw code is always shown by the UI regardless.
  //
  // Order of trust: wording USCIS published for THIS case beats the federal
  // schema, which beats wording USCIS published for another of the user's
  // cases on the same form. That last tier stays below NIEM deliberately — it
  // is real USCIS prose, but it was written about a different case, and on a
  // tool whose job is reporting change it must never look like this case's
  // own status.
  function describeCode(code, formType, caseNumber) {
    if (!code) return null;
    var key = String(code).toUpperCase();

    var learned = loadLearned().byCode[learnedKey(code, formType)] || null;
    // Normalised on both sides. Exact string equality compared a receipt number
    // from caseStatus against one from caseDetail, so any difference in case or
    // padding silently demoted this case's OWN USCIS wording to the "from
    // another case" tier. It fails safe, but it fails.
    if (learned && caseNumber &&
        String(learned.from).toUpperCase().trim() === String(caseNumber).toUpperCase().trim()) {
      return { text: learned.text, source: 'uscis' };
    }
    // The official federal schema (NIEM). These are USCIS's internal
    // operations phrases, so the UI labels them as a system description
    // rather than presenting them as the wording USCIS wrote to this person.
    if (codeTableLoaded()) {
      if (USCIS_CODE_MEANINGS[key]) {
        return { text: USCIS_CODE_MEANINGS[key], source: 'niem' };
      }
      if (learned) {
        return { text: learned.text, source: 'uscis-other' };
      }
      // Genuinely absent from the published schema — an honest unknown.
      return null;
    }

    // The dictionary itself failed to load. We cannot tell whether this code
    // has a published meaning, so we must not claim it has none. Reported as
    // 'unavailable' so the UI stays silent about meaning instead of printing
    // a confident denial that a correct build would never print.
    if (learned) return { text: learned.text, source: 'uscis-other' };
    return { text: null, source: 'unavailable' };
  }

  // Whether the event-code dictionary is present. The build concatenates
  // core/uscis-codes.js ahead of this file; if that ever breaks, every code
  // would otherwise degrade into "no published meaning" — turning a packaging
  // fault into a false statement about the user's case. Warn once, loudly.
  var warnedMissingCodeTable = false;
  function codeTableLoaded() {
    var present = (typeof USCIS_CODE_MEANINGS !== 'undefined') &&
      USCIS_CODE_MEANINGS && typeof USCIS_CODE_MEANINGS === 'object';
    if (!present && !warnedMissingCodeTable) {
      warnedMissingCodeTable = true;
      if (window.console && window.console.warn) {
        window.console.warn('[CaseLens] Event-code dictionary (core/uscis-codes.js) is not loaded. ' +
          'Event codes will be shown without descriptions rather than being reported as having none.');
      }
    }
    return present;
  }

  // ==========================================================================
  // SECTION 5: Derived display helpers  (pure functions)
  // ==========================================================================
  // relativeDate(iso) -> "2 days ago" | "in 3 months" | '' (coarse units)
  // parseEstimateMonths(processingTimes) -> number|null ("X Months" patterns in
  //   estimatedTimeframe/processingTime/rangeText/range fields)
  // progressInfo(receivedDateIso, months) -> { pct, etaText }|null (pct clamped 0-100)
  // redactNumber(n) -> 'IOE09•••••678' style mask
  // summaryText(entry) -> plain-text case summary for clipboard (honors prefs.redact)
  // extractUscisEvents(result) -> [{ source, at, code, text }] merged event list
  // summarize* helpers (caseDetail/location/caseStatus/processingTimes/documents)
  //   via pick() candidate keys against the FIELDS map; always null-safe.

  // --------------------------------------------------------------------------
  // DAY ARITHMETIC — one definition of "a day", used by everything.
  //
  // A day here is a calendar day, local midnight to local midnight, because
  // this is a tool for people counting days on a calendar. Two helpers that
  // each rounded a millisecond delta their own way is how the same date came
  // to print "30 days ago" in one line and "29 days ago" in the next, and how
  // "Day N" gained an off-by-one across a daylight-saving boundary.
  // --------------------------------------------------------------------------
  var MS_PER_DAY = 24 * 60 * 60 * 1000;

  function startOfLocalDay(ms) {
    var d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function endOfLocalDay(ms) {
    var d = new Date(ms);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
  }

  function sameLocalDay(a, b) {
    if (a === null || b === null) return false;
    return startOfLocalDay(a) === startOfLocalDay(b);
  }

  // Whole calendar days from one instant to another; negative when `toMs` is
  // the earlier of the two. The only day-difference function in this file.
  function daysBetween(fromMs, toMs) {
    return Math.round((startOfLocalDay(toMs) - startOfLocalDay(fromMs)) / MS_PER_DAY);
  }

  // Calendar days between a date USCIS gave us and today, or null when the
  // value is unusable. Negative for a date in the future.
  function daysSince(value) {
    var ms = parseUscisDate(value);
    if (ms === null) return null;
    return daysBetween(ms, new Date().getTime());
  }

  // Coarse, human-friendly relative time for the panel's own clock — when we
  // last checked, when we last looked. Below a day it reports elapsed time;
  // from a day up it counts calendar days like everything else.
  function relativeDate(iso) {
    if (!iso) return '';
    var ms = parseUscisDate(iso);
    if (ms === null) return '';

    var now = new Date().getTime();
    var diffMs = now - ms;
    var future = diffMs < 0;
    var absSeconds = Math.abs(diffMs) / 1000;

    function phrase(value, unit) {
      var word = value === 1 ? unit : unit + 's';
      return future ? ('in ' + value + ' ' + word) : (value + ' ' + word + ' ago');
    }

    if (absSeconds < 60) return future ? 'in a moment' : 'just now';

    var absMinutes = absSeconds / 60;
    if (absMinutes < 60) return phrase(Math.round(absMinutes), 'minute');

    // Floor, not round: rounding reported "24 hours ago" for anything from
    // 23h30m onward, a unit that never exists in the next branch either.
    var absHours = absMinutes / 60;
    if (absHours < 24) return phrase(Math.max(1, Math.floor(absHours)), 'hour');

    var absDays = Math.abs(daysBetween(ms, now));
    if (absDays <= 60) return phrase(absDays, 'day');

    var absMonths = Math.round(absDays / 30.4);
    if (absMonths < 24) return phrase(absMonths, 'month');

    return phrase(Math.round(absDays / 365), 'year');
  }

  // Extract an estimated processing time in months from whatever shape the
  // processing-times endpoint happens to return. Undocumented API, so we try
  // a structured { range: { value, unit } } shape first, then fall back to
  // regexing "X months" out of free-text fields.
  function parseEstimateMonths(processingTimes) {
    if (!payloadUsable(processingTimes)) return null;

    if (processingTimes.range && typeof processingTimes.range === 'object') {
      var value = processingTimes.range.value;
      var unit = processingTimes.range.unit;
      if (typeof value === 'number' && typeof unit === 'string' && /month/i.test(unit)) {
        return value;
      }
    }

    var text = pick(processingTimes, FIELDS.processingTimes.estimate);
    if (typeof text !== 'string') return null;

    var match = text.match(/([\d.]+)\s*month/i);
    if (!match) return null;

    var months = parseFloat(match[1]);
    return isNaN(months) ? null : months;
  }

  // How far this case is through the range USCIS itself published for it.
  // Returns a percentage and nothing else: this function once also returned a
  // projected decision month, which is the predicted date the whole tool is
  // built to refuse, and it was one caller away from being printed.
  function progressInfo(receivedDateIso, months) {
    if (!receivedDateIso || typeof months !== 'number' || !(months > 0)) return null;

    var received = parseUscisDate(receivedDateIso);
    if (received === null) return null;

    var elapsedDays = daysBetween(received, new Date().getTime());
    var pct = Math.round((elapsedDays / (months * 30.4)) * 100);
    if (pct < 0) pct = 0;
    if (pct > 100) pct = 100;

    return { pct: pct };
  }

  // Mask the middle of a case number for screen-sharing safety, e.g.
  // "IOE091234567890" -> "IOE09•••••890". Numbers too short to usefully
  // redact are returned unchanged.
  function redactNumber(n) {
    if (typeof n !== 'string' || n.length < 10) return n;
    return n.slice(0, 5) + '•••••' + n.slice(-3);
  }

  // Every JSON field that names or locates a person. Declared as a list, not
  // buried in a regex literal, so adding one is a one-line change and so an
  // audit can read what redaction actually covers.
  //
  // These are keys USCIS has been observed returning; the list is deliberately
  // wider than that, because a field we have not seen yet is exactly the one
  // that will appear in someone's screenshot.
  var REDACT_JSON_FIELDS = [
    'applicantName', 'representativeName', 'beneficiaryName', 'petitionerName',
    'attorneyName', 'preparerName', 'sponsorName',
    'firstName', 'lastName', 'middleName', 'fullName', 'name',
    'address', 'addressLine1', 'addressLine2', 'street', 'city', 'state',
    'county', 'country', 'postalCode', 'zipCode',
    'email', 'emailAddress', 'phone', 'phoneNumber',
    // Identifiers that name a person as directly as a name does.
    'alienNumber', 'aNumber', 'ssn', 'socialSecurityNumber',
    'dateOfBirth', 'dob', 'countryOfBirth', 'placeOfBirth', 'nationality',
    'letterId', 'contentId'
  ];

  // Fast lookup for the list above, so a walker can ask "is this key
  // sensitive?" per field without scanning an array each time.
  var REDACT_FIELD_SET = (function () {
    var set = Object.create(null);
    for (var i = 0; i < REDACT_JSON_FIELDS.length; i++) {
      set[REDACT_JSON_FIELDS[i].toLowerCase()] = true;
    }
    return set;
  })();

  // THE redaction policy, in one place: given a field name and its value,
  // what may be shown?
  //
  // This exists because the two renderers that show USCIS's payload cannot
  // share a regex. redactRawJson() below works on serialised JSON text, and
  // its field rule depends on seeing `"key": "value"`; the record view walks
  // parsed objects and hands over bare values, which that pattern would match
  // nothing in — silently, with names left on screen. Extracting the decision
  // means one list governs both, and adding a field to REDACT_JSON_FIELDS
  // protects both at once. test/unit.js holds them to agreement.
  // The policy above with the preference lookup pulled out, so a caller that
  // is not reading from stored prefs — the printable record, which must be
  // able to render masked or full regardless of the "Hide receipt numbers"
  // setting — can hand in the choice explicitly instead of going through
  // state. Takes no state; pure in on -> out.
  function redactValueWith(key, value, on) {
    if (!on) return value;
    if (typeof key === 'string' && REDACT_FIELD_SET[key.toLowerCase()]) return '[hidden]';
    if (typeof value !== 'string') return value;
    return value.replace(/[A-Z]{3}[0-9]{10}/gi, function (n) { return redactNumber(n); });
  }

  // Thin wrapper kept so the rest of the panel — which renders from the
  // stored preference, not an explicit choice — can keep calling this name
  // unchanged.
  function redactFieldValue(key, value) {
    return redactValueWith(key, value, !!(state.prefs && state.prefs.redact));
  }

  // "Hide receipt numbers" is used before sharing a screenshot, so it has to
  // cover the raw JSON too — that payload carries names, addresses and
  // document ids as well as the receipt number, and masking the card heading
  // while leaving them visible one click away defeats the point.
  // Same split as redactValueWith: the policy takes an explicit on/off so a
  // renderer outside the panel — the printable record — can choose masked or
  // full without going through the stored preference. Pure; reads no state.
  function redactJsonWith(text, on) {
    if (!on) return text;
    if (typeof text !== 'string') return text;

    // The value pattern must consume escaped quotes. `[^"]*` stopped at the
    // first \" inside a value, leaving the rest of that string — and the keys
    // after it — unmasked.
    var valueRe = new RegExp(
      '("(?:' + REDACT_JSON_FIELDS.join('|') + ')"\\s*:\\s*)"(?:[^"\\\\]|\\\\.)*"', 'gi');

    return text
      .replace(/[A-Z]{3}[0-9]{10}/gi, function (n) { return redactNumber(n); })
      .replace(valueRe, '$1"[hidden]"');
  }

  // Thin wrapper kept for existing callers that render from the stored
  // preference rather than an explicit choice.
  function redactRawJson(text) {
    return redactJsonWith(text, !!(state.prefs && state.prefs.redact));
  }

  // Policy for a case number's display form, given an explicit on/off rather
  // than the stored preference — needed so the printable record can render
  // masked or full independent of "Hide receipt numbers". Reads no state.
  function numberFor(n, on) {
    if (on) return redactNumber(n);
    return n;
  }

  // Case number as it should be shown in the UI, honoring the user's redact
  // preference.
  function displayNumber(n) {
    return numberFor(n, !!(state.prefs && state.prefs.redact));
  }

  // USCIS names document files after the receipt number, so the document list
  // printed the number in full — in visible text and in the title attribute —
  // while "Hide receipt numbers" was on. The document list is exactly what
  // gets scrolled past on the screen share this setting exists for.
  // Policy for a file name's display form, split out from the preference for
  // the same reason as numberFor: the printable record needs an explicit
  // masked/full choice, not the stored setting. Reads no state.
  function fileNameFor(name, on) {
    if (!name || !on) return name;
    return String(name).replace(/[A-Z]{3}[0-9]{10}/gi, function (match) {
      return redactNumber(match);
    });
  }

  function displayFileName(name) {
    return fileNameFor(name, !!(state.prefs && state.prefs.redact));
  }

  // Plain-text summary of one case, suitable for copying to clipboard (e.g.
  // to paste into an email to a lawyer). Skips any line whose data is
  // missing rather than showing "null" or "undefined".
  function summaryText(entry) {
    var lines = [];
    if (entry.label) lines.push(entry.label);
    lines.push(displayNumber(entry.number));

    var result = entry.result;
    var detail = result ? summarizeCaseDetail(result.caseDetail) : null;
    var notice = result ? summarizeCaseStatus(result.caseStatus) : null;
    var processing = result ? summarizeProcessingTimes(result.processingTimes) : null;

    if (detail && (detail.formType || detail.formName)) {
      lines.push('Form: ' + [detail.formType, detail.formName].filter(Boolean).join(' — '));
    }
    if (notice && notice.status) {
      lines.push('Status: ' + notice.status);
    }
    if (notice && notice.actionCodeDate) {
      lines.push('Status date: ' + formatDate(notice.actionCodeDate));
    }
    if (detail && detail.submissionDate) {
      var filedDays = daysSince(detail.submissionDate);
      lines.push('Filed: ' + formatDate(detail.submissionDate) +
        (filedDays !== null ? ' (' + filedDays + ' days ago)' : ''));
    }
    if (detail && detail.backendAt) {
      lines.push('Record last updated: ' + formatDate(detail.backendAt));
    }
    if (notice && notice.office) {
      lines.push('Office: ' + notice.office);
    }
    if (processing && processing.estimate) {
      lines.push('Processing estimate: ' + processing.estimate);
    }

    lines.push('via CaseLens (local, unofficial)');

    return lines.join('\n');
  }

  // Every absolute date this panel prints comes from here. There are three
  // shapes because they read differently in three places, but only one
  // implementation and one month table each — formatDayLabel used to build the
  // short date and then string-replace the year back out of it, which would
  // have silently stopped stripping the moment the short format changed.
  //
  //   'short' — "Jul 9, 2026"       inline, next to a value
  //   'full'  — "July 9, 2026"      pasted into email; 07/09 is ambiguous
  //   'day'   — "Jul 9" this year, "Jul 9, 2026" otherwise; timeline meta
  function formatDateAs(value, shape) {
    var ms = typeof value === 'number' ? value : parseUscisDate(value);
    if (ms === null || ms === undefined) return '';
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '';

    var month = shape === 'full' ? MONTHS_FULL[d.getMonth()] : MONTHS_SHORT[d.getMonth()];
    var head = month + ' ' + d.getDate();
    if (shape === 'day' && d.getFullYear() === new Date().getFullYear()) return head;
    return head + ', ' + d.getFullYear();
  }

  // Short absolute date, e.g. "Jul 9, 2026". Returns '' when unparseable.
  function formatDate(value) {
    return formatDateAs(value, 'short');
  }

  // USCIS's history entries use "MM-DD-YYYY HH:mm:ss", which no browser parses
  // consistently. Everything else is ISO. This handles both and returns a
  // timestamp in milliseconds, or null when the value is unusable.
  function parseUscisDate(value) {
    if (!value) return null;

    // USCIS sends calendar dates two ways: bare "2026-05-29", and the same day
    // as UTC midnight ("2026-05-29T00:00:00.000Z"). Both mean a date, not an
    // instant. Parsing them as UTC and then rendering in the viewer's zone
    // moves them a day backwards anywhere west of Greenwich — which showed a
    // case filed May 29 as "filed May 28" and shifted every day count by one.
    // Build these as local dates so the calendar day survives.
    // Only strings. `new Date(['2026-05-29'])` stringifies the array and parses
    // it as UTC, quietly producing a date a day early west of Greenwich — an
    // object where a string was expected should be nothing, not a wrong answer.
    if (typeof value !== 'string') return null;

    // Midnight-UTC in ANY spelling, matched on the value rather than on a
    // whitelist of formats. The whitelist was `Z`, `.000Z` or nothing — but
    // USCIS returns document dates as `+0000` (see test/fixtures.js), and
    // `.0Z`, `.000000Z` and `T00:00Z` all occur in ISO output too. Every one of
    // those fell through to the instant branch and lost a day.
    var utcMidnight = value.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[T ]00:00(?::00(?:\.0+)?)?(?:Z|[+-]00:?00)?)?$/);
    if (utcMidnight) {
      return localDate(+utcMidnight[1], +utcMidnight[2], +utcMidnight[3], 0, 0, 0);
    }

    // USCIS's status history: "MM-DD-YYYY HH:mm:ss", which no browser parses
    // consistently.
    var m = value.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/);
    if (m) {
      return localDate(+m[3], +m[1], +m[2],
        m[4] ? +m[4] : 0, m[5] ? +m[5] : 0, m[6] ? +m[6] : 0);
    }

    var iso = new Date(value);
    return isNaN(iso.getTime()) ? null : iso.getTime();
  }

  // Build a local-time date, refusing anything the calendar does not contain.
  //
  // The Date constructor rolls over silently: month 13 becomes January of the
  // next year, day 45 becomes the middle of the following month, and February
  // 30th becomes March 2nd. Both hand-rolled branches above fed unvalidated
  // components straight into it, so a sentinel or a schema wobble rendered as a
  // confident, plausible, wrong date instead of as nothing. Round-tripping the
  // components is the check: if the date that came out is not the date that
  // went in, it was never a real date.
  function localDate(year, month, day, hh, mm, ss) {
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    if (hh > 23 || mm > 59 || ss > 59) return null;
    var d = new Date(year, month - 1, day, hh, mm, ss);
    if (isNaN(d.getTime())) return null;
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    return d.getTime();
  }

  // Every event USCIS gives us for a case, from two sources of differing
  // richness, tagged with provenance so the UI can be honest about where each
  // line came from:
  //   'status'  — dated entry with USCIS's own wording (historicalCaseStatuses)
  //   'event'   — coded machine event, text only if we can translate the code
  //   'notice'  — a generated notice or scheduled appointment
  // Not sorted here; the UI orders them.
  function extractUscisEvents(result) {
    var events = [];
    if (!result) return events;

    // Both are the scope describeCode() resolves a code within, and both must
    // be what USCIS reported: result.formTypeUsed may be DEFAULT_FORM_TYPE,
    // which exists to build a URL and is not a fact about this case.
    var formType = pick(result.caseDetail, FIELDS.caseDetail.formType);
    if (formType === null) formType = pick(result.caseStatus, FIELDS.caseStatus.formType);
    var caseNumber = pick(result.caseDetail, FIELDS.caseDetail.receiptNumber);
    if (caseNumber === null) caseNumber = pick(result.caseStatus, FIELDS.caseStatus.receiptNumber);

    var notice = result.caseStatus;
    if (payloadUsable(notice)) {
      var history = pick(notice, FIELDS.caseStatus.history);
      if (Array.isArray(history)) {
        for (var i = 0; i < history.length; i++) {
          var h = history[i];
          var hText = pick(h, FIELDS.historyItem.text);
          events.push({
            source: 'status',
            at: parseUscisDate(pick(h, FIELDS.historyItem.date)),
            code: pick(h, FIELDS.historyItem.actionCode),
            text: hText !== null ? stripHtml(String(hText)) : null,
            textSpanish: stripHtml(pick(h, FIELDS.historyItem.textSpanish) || ''),
            official: true
          });
        }
      }
    }

    var caseDetail = result.caseDetail;
    if (payloadUsable(caseDetail)) {
      var raw = pick(caseDetail, FIELDS.caseDetail.events);
      if (Array.isArray(raw)) {
        for (var j = 0; j < raw.length; j++) {
          var e = raw[j];
          var code = pick(e, FIELDS.eventItem.code);
          var translated = describeCode(code, formType, caseNumber);
          events.push({
            source: 'event',
            at: parseUscisDate(pick(e, FIELDS.eventItem.date)),
            code: code !== null ? String(code) : null,
            text: translated ? translated.text : null,
            textSource: translated ? translated.source : null,
            official: !!(translated && translated.source === 'uscis')
          });
        }
      }

      var notices = pick(caseDetail, FIELDS.caseDetail.notices);
      if (Array.isArray(notices)) {
        for (var k = 0; k < notices.length; k++) {
          var n = notices[k];
          var appointmentAt = pick(n, FIELDS.noticeItem.appointmentAt);
          events.push({
            source: 'notice',
            at: parseUscisDate(pick(n, FIELDS.noticeItem.generatedAt)),
            code: null,
            text: flattenValue(pick(n, FIELDS.noticeItem.type)),
            appointmentAt: appointmentAt || null,
            letterId: pick(n, FIELDS.noticeItem.letterId),
            official: true
          });
        }
      }
    }

    return events;
  }

  // The case-detail endpoint: what was filed, and when USCIS last touched it.
  function summarizeCaseDetail(data) {
    if (!payloadUsable(data)) return null;
    return {
      receiptNumber: pick(data, FIELDS.caseDetail.receiptNumber),
      // flattenValue, not the raw value. An object here reaches stageInfo as
      // "[OBJECT OBJECT]", misses the lookup, and renders no stage rail at all
      // — indistinguishable from the legitimate unknown-form path, and silent.
      formType: flattenValue(pick(data, FIELDS.caseDetail.formType)),
      formName: flattenValue(pick(data, FIELDS.caseDetail.formName)),
      submissionDate: pick(data, FIELDS.caseDetail.submissionDate),
      backendAt: pick(data, FIELDS.caseDetail.updatedAt),
      closed: pick(data, FIELDS.caseDetail.closed) === true,
      actionRequired: pick(data, FIELDS.caseDetail.actionRequired) === true,
      premium: pick(data, FIELDS.caseDetail.premium) === true,
      representativeName: pick(data, FIELDS.caseDetail.representativeName)
    };
  }

  // The case_status endpoint: official status wording, action code, office, and
  // the dated status history. This is the richest source we have.
  function summarizeCaseStatus(data) {
    if (!payloadUsable(data)) return null;

    var statusValue = pick(data, FIELDS.caseStatus.status);
    var detailValue = pick(data, FIELDS.caseStatus.statusDetail);
    var statusEs = pick(data, FIELDS.caseStatus.statusSpanish);
    var detailEs = pick(data, FIELDS.caseStatus.statusDetailSpanish);
    var history = pick(data, FIELDS.caseStatus.history);

    return {
      receiptNumber: pick(data, FIELDS.caseStatus.receiptNumber),
      formNumber: pick(data, FIELDS.caseStatus.formType),
      status: statusValue !== null ? stripHtml(String(statusValue)) : null,
      statusDetail: detailValue !== null ? stripHtml(String(detailValue)) : null,
      statusSpanish: statusEs !== null ? stripHtml(String(statusEs)) : null,
      statusDetailSpanish: detailEs !== null ? stripHtml(String(detailEs)) : null,
      actionCode: pick(data, FIELDS.caseStatus.actionCode),
      actionCodeDate: pick(data, FIELDS.caseStatus.actionCodeDate),
      office: flattenValue(pick(data, FIELDS.caseStatus.office)),
      historyCount: Array.isArray(history) ? history.length : 0
    };
  }

  // The secondary location endpoint. Usually returns nothing at all; the real
  // office name comes from the case_status jurisdiction instead.
  function summarizeLocation(data) {
    if (!payloadUsable(data)) return null;
    return {
      office: flattenValue(pick(data, FIELDS.location.office)),
      address: flattenValue(pick(data, FIELDS.location.address))
    };
  }

  // Processing-time estimates. In practice this endpoint answers 204 with no
  // body, so callers must handle null and fall back to elapsed time.
  function summarizeProcessingTimes(data) {
    if (!payloadUsable(data)) return null;
    var estimate = pick(data, FIELDS.processingTimes.estimate);
    var medianDays = pick(data, FIELDS.processingTimes.medianDays);
    if (estimate === null && medianDays === null) return null;
    return { estimate: estimate, medianDays: medianDays };
  }

  function summarizeDocuments(data) {
    var list = documentList(data);
    if (!list) return null;

    var out = [];
    for (var i = 0; i < list.length; i++) {
      var item = list[i];
      out.push({
        name: pick(item, FIELDS.documentItem.name),
        date: pick(item, FIELDS.documentItem.date),
        type: pick(item, FIELDS.documentItem.type),
        source: pick(item, FIELDS.documentItem.source),
        url: pick(item, FIELDS.documentItem.url)
      });
    }
    return out;
  }

  // ==========================================================================
  // SECTION 6: UI
  // ==========================================================================
  // Everything below builds DOM with createElement/createElementNS and
  // textContent only — there is no HTML string anywhere in this file, so a
  // hostile value coming back from an undocumented API can never become
  // markup. The design this implements lives in docs/design/ (SPEC.md is
  // binding); the two rules that shape most of it:
  //   1. Never show the user something we cannot derive from their own case
  //      data. No medians, no predicted dates, no synthesized percentages.
  //   2. Colour may encode state only from a structured boolean the API sent
  //      (actionRequired, closed) or from our own "changed since you looked"
  //      observation. Never from pattern-matching status prose.
  // --------------------------------------------------------------------------

  // Module-level UI state. None of this is persisted directly — it's either
  // derived from state/prefs (which are persisted) or purely transient
  // (drag-in-progress, popover open/closed, unsaved add-case form text).
  var ROOT = null;                 // the single fixed-position container in document.body
  var uiState = {
    settingsOpen: false,
    addNumberValue: '',
    addLabelValue: '',
    addError: null,               // validation message from the last failed submit
    addPendingNumber: null,       // the number that failed validation, for "Add anyway"
    addOpen: false,               // the add-case form is collapsed until asked for
    openNumber: null,             // the one open case, for this page view only
    panelMounted: false,          // has the panel been on screen since last opened
    renderedWide: false,          // layout actually on screen, so resize can compare
    printFor: null                // 'all', or a receipt number, while the print choice is open
  };
  // Per-case reading state — which disclosures are open on which card. Keyed
  // by receipt number, and lasts exactly as long as the page does.
  //
  // These used to be set as `ui*` properties directly on the case entries in
  // state.cases — the same objects persistCases() writes to localStorage. They
  // stayed out of storage only because persistCases enumerates its fields by
  // hand, so the separation was an accident of one function's style rather than
  // a boundary: writing `toSave.push(c)` there would have started persisting
  // which disclosures a reader had opened.
  uiState.perCase = Object.create(null);

  function caseUi(entry) {
    var key = String(entry.number).toUpperCase();
    if (!uiState.perCase[key]) uiState.perCase[key] = {};
    return uiState.perCase[key];
  }

  var dragState = null;            // in-progress panel drag, or null
  var refreshTimerId = null;       // setInterval handle for periodic refreshAll()

  // ---- UI constants ---------------------------------------------------------

  // Evidence-driven stages (docs/design/04-evidence-stages.md). There is no
  // per-form sequence any more: a case's map is a definitional spine —
  // Received, Under review, Decision, true of every case that exists — plus
  // whatever steps its own record evidences, ordered by the case's own
  // timestamps. The code→step mapping lives in core/uscis-codes.js
  // (USCIS_CODE_STAGES), where each entry cites the NIEM description that
  // justifies it. A form or code this tool has never seen gets a correct,
  // sparse map rather than none, because the form universe is open: concurrent
  // companions (I-485J, I-131) arrive with IOE receipts despite never
  // appearing on any published list of online-filable forms.
  var STAGE_TYPE_LABELS = {
    received: 'Received',
    appointment: 'Appointment',
    biometrics: 'Biometrics',
    evidence: 'Evidence requested',
    interview: 'Interview',
    review: 'Under review',
    decision: 'Decision',
    card: 'Card produced'
  };

  // The one per-form label nuance that is published fact: an I-131 produces a
  // travel document, not a card (Form I-131 Instructions, "Refugee Travel
  // Document"/"Advance Parole Document"; NIEM MBB/MBC say "document produced").
  var STAGE_LABEL_OVERRIDES = {
    'I-131': { card: 'Document produced' }
  };

  // Steps a form's own USCIS instructions provide for. Verified against the
  // instructions PDFs on uscis.gov (retrieved 2026-08-12); every one phrases
  // biometrics conditionally — "if we determine that a biometric services
  // appointment is necessary, we will send you an appointment notice" — so the
  // claim this table supports is "this form can involve X", never "X will
  // happen" or "X is required for you". An expected step with no evidence
  // renders in the NOT-REPORTED state, which exists because of a verified
  // fact: USCIS does not report biometrics through these endpoints at all. A
  // live account whose owner attended a biometrics appointment carries no
  // biometrics code, no "biometric" string in any field — only a generic
  // "Appointment Scheduled" notice. A hollow stage would read as "you have not
  // done this", which for that account was false.
  //
  // Citations (all: Instructions for the form, uscis.gov/sites/default/files/
  // document/forms/<form>instr.pdf, "Biometric Services Appointment" section):
  //   I-485  "review your copy ... before you go to your biometric services
  //           appointment at a USCIS ASC"
  //   I-765  "Biometric Services Appointment" (Required Evidence)
  //   I-131  "go to their local Application Support Center (ASC) for their
  //           biometric services appointment"
  //   N-400  "USCIS may require you to appear for an interview and provide
  //           biometrics"
  //   I-90   "If we determine that a biometric services appointment is
  //           necessary, we will send you an appointment notice"
  //   I-751  same conditional wording as I-90
  //   I-821  "Biometric Services Appointment" (What Evidence Must You Submit)
  var FORM_EXPECTED_STEPS = {
    'I-485': ['biometrics'],
    'I-765': ['biometrics'],
    'I-131': ['biometrics'],
    'N-400': ['biometrics'],
    'I-90': ['biometrics'],
    'I-751': ['biometrics'],
    'I-821': ['biometrics']
  };

  // Supplement J legitimately shows nothing for months; say so rather than let
  // an all-quiet rail read as a stuck case.
  var STAGE_FOOTNOTES = {
    'I-485J': 'Supplement J often shows no visible movement at all until the underlying I-485 is decided.'
  };

  // Codes that change what a person should DO, each with the NIEM description
  // that justifies its category. Nothing goes in here without wording from
  // core/uscis-codes.js that plainly supports the claim the banner makes —
  // this is the one place the panel raises an alarm, so it is the one place a
  // guess is least acceptable.
  //
  // This used to be a flat list of nine codes with no citation, all raising
  // "USCIS may need something from you". Read against the schema, four of the
  // nine were internal state that asks nothing of anyone (FKA deschedule,
  // FS adjudication hold, KH litigation hold, plus the deschedule's partner) —
  // and two, EA and IFA, are *denials*. Telling someone whose case was just
  // denied that USCIS may need something from them is not a small mis-label.
  //
  // Denials and holds are deliberately absent. USCIS's own status wording
  // carries the outcome, and the timeline still shows the coded event with its
  // schema description; adding our own red banner on top would be this tool
  // interpreting an outcome, which is the thing it does not do.
  var ACTION_CODES = {
    // USCIS has asked this person for something, and there is a deadline.
    FBA: 'evidence',    // "Initial evidence request notice ordered"
    IK: 'evidence',     // "Request for additional evidence sent"
    II: 'evidence',     // "Notice of intent to deny sent"
    // Needs attention, but USCIS is not waiting on a response.
    LFA: 'delivery'     // "Card returned as undeliverable"
  };

  // How long an action code stays worth raising. USCIS publishes no deadline
  // with these codes, so age is the only honest signal available — and a
  // response window measured in weeks means a year-old code is history.
  var ACTION_CODE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

  var ACTION_CODE_COPY = {
    evidence: {
      title: 'USCIS has asked you for something',
      line: 'There is normally a deadline. Check your USCIS account and your mail for the notice, and follow what the notice says.'
    },
    delivery: {
      title: 'A card USCIS mailed you came back to them',
      line: 'This usually means the address they have is out of date. Check your mailing address on my.uscis.gov.'
    }
  };

  // No 'document' rank: documents carry provenance 'local' with kind
  // 'document', so no item is ever built with that provenance.
  var PROV_RANK = { official: 0, notice: 1, coded: 2, document: 3, local: 4, anchor: 5 };
  var DEDUPE_WINDOW_MS = 36 * 60 * 60 * 1000;   // official (day) x coded (second), same code
  var GAP_LABEL_MIN_DAYS = 14;
  var BACKEND_MIN_LAG_MS = 3 * 24 * 60 * 60 * 1000;  // §4.3: below 3 days it is noise
  var TIMELINE_FOLD = 4;                        // rows shown before "Show all"

  var MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  var MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WEEKDAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  // ---- DOM helpers ----------------------------------------------------------

  // Build one DOM element without ever touching innerHTML. `attrs` keys:
  //   'class'      -> className
  //   'text'       -> textContent
  //   'checked'/'disabled'/'selected' -> set as a live DOM property (not
  //                   setAttribute) so falsy values actually clear the state
  //                   instead of leaving a stale/always-present attribute
  //   'value'      -> set as a live DOM property (works for <select> too)
  //   keys starting with 'on' + a function -> addEventListener
  //   anything else (title, type, placeholder, href, target, rel, ...) -> setAttribute
  // null/undefined attr values are skipped entirely. `children` may contain
  // strings (become text nodes), elements, or null/undefined (skipped) so
  // callers can inline conditional children without extra filtering.
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    var key;
    if (attrs) {
      for (key in attrs) {
        if (!attrs.hasOwnProperty(key)) continue;
        var value = attrs[key];
        if (value === null || value === undefined) continue;

        if (key === 'class') {
          node.className = value;
        } else if (key === 'text') {
          node.textContent = value;
        } else if (key.indexOf('on') === 0 && key.length > 2 && typeof value === 'function') {
          node.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === 'checked' || key === 'disabled' || key === 'selected') {
          node[key] = !!value;
        } else if (key === 'value') {
          node.value = value;
        } else {
          node.setAttribute(key, value);
        }
      }
    }
    if (children) {
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        if (child === null || child === undefined) continue;
        node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
      }
    }
    return node;
  }

  function clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // Tie a disclosure button to the thing it opens, so a screen reader says what
  // "Explain" or "Show full text" is about to reveal instead of announcing a
  // button whose label is a verb with no object.
  //
  // render() rebuilds the whole panel, so ids only need to be unique within one
  // render pass; the counter never resets and never collides.
  var domIdSeq = 0;

  function linkDisclosure(button, target) {
    if (!button || !target) return target;
    if (!target.id) target.id = 'uscistr-d' + (++domIdSeq);
    button.setAttribute('aria-controls', target.id);
    return target;
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';

  // SVG elements need createElementNS and per-attribute setAttribute; el()
  // above would produce an HTML element of the same tag name that never paints.
  function svgTag(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    if (attrs) {
      for (var key in attrs) {
        if (attrs.hasOwnProperty(key)) node.setAttribute(key, String(attrs[key]));
      }
    }
    return node;
  }

  // Every glyph in the panel. Shapes carry NO fill=/stroke= attributes: a
  // presentation attribute loses to any author rule, and the host-CSS defence
  // in the stylesheet sets `svg * { fill: none; stroke: none }`. Paint comes
  // from .uscistr-ico (and the .uscistr-fill / -thin / -faint / -hair helper
  // classes) instead. See docs/design/02 §5.1 — this was learned the hard way.
  var ICONS = {
    // Timeline node glyphs — provenance is carried by SHAPE first, colour last.
    disc: { view: '0 0 12 12', shapes: [['circle', { cx: 6, cy: 6, r: 4, 'class': 'uscistr-fill' }]] },
    discRing: { view: '0 0 12 12', shapes: [
      ['circle', { cx: 6, cy: 6, r: 4, 'class': 'uscistr-fill' }],
      ['circle', { cx: 6, cy: 6, r: 5.25, 'class': 'uscistr-thin uscistr-faint' }]
    ] },
    ring: { view: '0 0 12 12', shapes: [['circle', { cx: 6, cy: 6, r: 3.75 }]] },
    ringDashed: { view: '0 0 12 12', shapes: [['circle', { cx: 6, cy: 6, r: 3.75, 'stroke-dasharray': '2.2 2' }]] },
    diamond: { view: '0 0 12 12', shapes: [['path', { d: 'M6 1.7 L10.3 6 L6 10.3 L1.7 6 Z' }]] },
    pulse: { view: '0 0 12 12', shapes: [
      ['circle', { cx: 6, cy: 6, r: 3, 'class': 'uscistr-fill' }],
      ['circle', { cx: 6, cy: 6, r: 5.4, 'class': 'uscistr-thin uscistr-faint' }]
    ] },
    cap: { view: '0 0 12 12', shapes: [['rect', { x: 2.5, y: 2.5, width: 7, height: 7, rx: 1.2, 'class': 'uscistr-fill' }]] },
    calendar: { view: '0 0 12 12', shapes: [
      ['rect', { x: 1.5, y: 2.5, width: 9, height: 8, rx: 1.5, 'class': 'uscistr-hair' }],
      ['path', { d: 'M1.5 5h9', 'class': 'uscistr-hair' }],
      ['path', { d: 'M4 1.5v2M8 1.5v2', 'class': 'uscistr-hair' }]
    ] },
    page: { view: '0 0 12 12', shapes: [
      ['path', { d: 'M2.5 1.5h4.2L9.5 4.3v6.2a.7.7 0 0 1-.7.7H2.5a.7.7 0 0 1-.7-.7V2.2a.7.7 0 0 1 .7-.7z', 'class': 'uscistr-hair' }],
      ['path', { d: 'M6.6 1.6v2.8h2.8', 'class': 'uscistr-hair' }]
    ] },
    alert: { view: '0 0 12 12', shapes: [
      ['path', { d: 'M6 1.6 11 10.4H1z', 'class': 'uscistr-hair' }],
      ['path', { d: 'M6 5v2.6', 'class': 'uscistr-hair' }],
      ['circle', { cx: 6, cy: 9.1, r: 0.75, 'class': 'uscistr-fill' }]
    ] },
    // Panel chrome.
    refresh: { view: '0 0 16 16', shapes: [
      ['path', { d: 'M13.4 8a5.4 5.4 0 1 1-1.6-3.8' }],
      ['path', { d: 'M13.5 2.3v3h-3' }]
    ] },
    // A cog, not a circle with eight straight rays — that earlier drawing was
    // the universal light/dark glyph, so people opened Settings looking for a
    // theme toggle and found one by accident.
    gear: { view: '0 0 24 24', shapes: [
      ['circle', { cx: 12, cy: 12, r: 3 }],
      ['path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' }]
    ] },
    minimize: { view: '0 0 16 16', shapes: [['path', { d: 'M3.5 8h9' }]] },
    chevron: { view: '0 0 16 16', shapes: [['path', { d: 'M6 3.5 10.5 8 6 12.5' }]] },
    copy: { view: '0 0 16 16', shapes: [
      ['rect', { x: 5.6, y: 5.6, width: 8, height: 8, rx: 1.6 }],
      ['path', { d: 'M10.4 5.6v-1a1.6 1.6 0 0 0-1.6-1.6H4a1.6 1.6 0 0 0-1.6 1.6v4.8A1.6 1.6 0 0 0 4 11h1' }]
    ] },
    warning: { view: '0 0 16 16', shapes: [
      ['path', { d: 'M8 2.2 14.6 13.4H1.4z' }],
      ['path', { d: 'M8 6.4v3' }],
      ['circle', { cx: 8, cy: 11.6, r: 0.85, 'class': 'uscistr-fill' }]
    ] },
    doc: { view: '0 0 16 16', shapes: [
      ['path', { d: 'M3.4 2.6h5.2l4 4v6.8a1 1 0 0 1-1 1H3.4a1 1 0 0 1-1-1V3.6a1 1 0 0 1 1-1z' }],
      ['path', { d: 'M8.6 2.7v4h4' }]
    ] },
    search: { view: '0 0 16 16', shapes: [
      ['circle', { cx: 7, cy: 7, r: 4.4 }],
      ['path', { d: 'M10.3 10.3 14 14' }]
    ] },
    shield: { view: '0 0 16 16', shapes: [
      ['path', { d: 'M8 1.8 13.2 4v4.1c0 3-2.2 5.3-5.2 6.1-3-0.8-5.2-3.1-5.2-6.1V4z' }],
      ['path', { d: 'M5.9 8.1 7.4 9.6l2.8-3' }]
    ] }
  };

  function buildIcon(name) {
    var spec = ICONS[name];
    if (!spec) return null;
    var svg = svgTag('svg', {
      viewBox: spec.view,
      'class': 'uscistr-ico',
      'aria-hidden': 'true',
      focusable: 'false'
    });
    for (var i = 0; i < spec.shapes.length; i++) {
      svg.appendChild(svgTag(spec.shapes[i][0], spec.shapes[i][1]));
    }
    return svg;
  }

  function chip(text, variant, withDot) {
    var node = el('span', { 'class': 'uscistr-chip uscistr-chip-' + (variant || 'neutral') });
    if (withDot) node.appendChild(el('span', { 'class': 'uscistr-chip-dot' }));
    node.appendChild(document.createTextNode(text));
    return node;
  }

  function codeChip(code) {
    return el('span', { 'class': 'uscistr-code', text: String(code) });
  }

  function metaSep() {
    return el('span', { 'class': 'uscistr-muted', text: '·' });
  }

  // ---- STYLE ----------------------------------------------------------------
  // The complete visual system from docs/design/02-visual-system.md §6, plus
  // the timeline/stage-rail components from 03. Every rule is scoped under
  // .uscistr-root so this can be injected into any my.uscis.gov page without
  // leaking onto the host page — and, just as important, without the host
  // page's CSS leaking in: .uscistr-root sets `all: initial`, a universal
  // descendant reset neutralises inherited properties, and every component
  // rule carries >= 2 classes so it outranks both. Dark mode is the single
  // class .uscistr-dark on the root container.
  //
  // NEVER put transform / filter / backdrop-filter / contain / will-change on
  // .uscistr-root: each would make it a containing block for its
  // position:fixed children and break panel placement.
  var STYLE = CASELENS_STYLE;

  function injectStyle() {
    if (document.getElementById('uscistr-style')) return;
    var styleEl = document.createElement('style');
    styleEl.id = 'uscistr-style';
    styleEl.textContent = STYLE;
    document.head.appendChild(styleEl);
  }

  // ---- date + text helpers (display only) ----------------------------------

  // "July 18, 2026". The month is always spelled out: 07/18/2026 is genuinely
  // ambiguous to a large share of this audience, and these strings get pasted
  // into emails to attorneys.
  function formatDateFull(value) {
    return formatDateAs(value, 'full');
  }

  // "Jul 18" for the current year, "Jul 18, 2026" otherwise. Timeline meta only.
  function formatDayLabel(ms) {
    return formatDateAs(ms, 'day');
  }

  // The short zone label for this device, e.g. "EDT". USCIS sends appointments
  // as a real UTC instant, so rendering it in the local zone shows the very
  // same moment — naming the zone is what makes that unambiguous. If the label
  // reads PDT and the office is Eastern, the mismatch is visible instead of
  // silently misleading.
  function localZoneLabel(ms) {
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZoneName: 'short', hour: 'numeric'
      }).formatToParts(new Date(ms));
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === 'timeZoneName') return parts[i].value;
      }
    } catch (e) {
      // Intl unavailable or unhappy — fall back to no label rather than guess.
    }
    return '';
  }

  // "5:58 PM" in the viewer's own zone. Only ever called for values that
  // actually carried a time — never for day-precision entries.
  function formatTimeOfDay(ms) {
    if (ms === null || ms === undefined) return '';
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    var hours = d.getHours();
    var suffix = hours >= 12 ? 'PM' : 'AM';
    var display = hours % 12;
    if (display === 0) display = 12;
    var mins = d.getMinutes();
    return display + ':' + (mins < 10 ? '0' + mins : mins) + ' ' + suffix;
  }

  function formatWeekday(ms) {
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    return WEEKDAYS_FULL[d.getDay()];
  }

  function plural(n, word) {
    return n + ' ' + word + (n === 1 ? '' : 's');
  }

  // "1 year, 22 days" — used only past the one-year mark, where "395 days"
  // stops being a number anyone can feel.
  function longDuration(days) {
    if (days < 365) return plural(days, 'day');
    var years = Math.floor(days / 365);
    var rest = days - years * 365;
    if (rest === 0) return plural(years, 'year');
    return plural(years, 'year') + ', ' + plural(rest, 'day');
  }

  function normalizeText(value) {
    return String(value === null || value === undefined ? '' : value)
      .toLowerCase().replace(/[\s.]+/g, ' ').trim();
  }

  // Middle-truncate a filename so both the case number and the part suffix
  // survive; a plain ellipsis at the end would hide the only part that differs.
  function middleTruncate(value, max) {
    var text = String(value);
    if (text.length <= max) return text;
    var head = Math.ceil((max - 1) / 2);
    var tail = Math.floor((max - 1) / 2);
    return text.slice(0, head) + '…' + text.slice(text.length - tail);
  }

  // What we can honestly say about one endpoint's response without having
  // stored the HTTP status: fetchJSON's own vocabulary, mapped back.
  function payloadStatus(payload) {
    if (payload === null || payload === undefined) return { text: 'not requested', variant: 'quiet' };
    if (payload.__auth) return { text: 'sign-in required', variant: 'warn' };
    if (payload.__error) {
      var matched = String(payload.__error).match(/HTTP (\d{3})/);
      if (matched) return { text: 'HTTP ' + matched[1], variant: 'danger' };
      if (String(payload.__error).indexOf('No data at this endpoint') === 0) return { text: 'HTTP 404', variant: 'warn' };
      if (String(payload.__error).indexOf('not valid JSON') !== -1) return { text: 'unreadable body', variant: 'danger' };
      if (String(payload.__error).indexOf('Network error') === 0) return { text: 'no response', variant: 'danger' };
      return { text: 'error', variant: 'danger' };
    }
    // Answered, with nothing in it: either a 204 or a null data envelope.
    // We did not record which, so the chip does not claim one.
    if (payload.__empty) return { text: 'no content', variant: 'quiet' };
    return { text: 'HTTP 200', variant: 'neutral' };
  }

  // The three questions worth asking about a response, in one vocabulary.
  // These used to be spelled out inline at eight call sites as
  // `x && !x.__error && !x.__empty`, which is the kind of condition that gets
  // one clause dropped in a refactor and then silently reads an error object
  // as if it were data.
  //
  //   payloadUsable  — answered, and carries something to read
  //   payloadFailed  — the request itself failed
  //   (neither)      — answered honestly with nothing (__empty)
  function payloadUsable(payload) {
    return !!(payload && !payload.__error && !payload.__empty);
  }

  function payloadFailed(payload) {
    return !!(payload && payload.__error);
  }

  // The two endpoints a card is made of. Everything else is supplementary;
  // losing both of these is losing the case for this check.
  function coreSourcesFailed(result) {
    return payloadFailed(result.caseDetail) && payloadFailed(result.caseStatus);
  }

  // ---- panel positioning / dragging ----------------------------------------

  // Keep the whole panel on-screen, not just a sliver of its header.
  //
  // Guaranteeing 46px of header was not enough: the panel is position:fixed, so
  // a panel dragged low hangs off the bottom with its footer, Export and Import
  // unreachable and no way to scroll to them. The position persists, so
  // unplugging a larger monitor could strand it that way permanently. When the
  // panel is genuinely taller than the viewport it is pinned to the top, which
  // is the only choice that keeps the header reachable.
  function clampPanelPos(x, y, panel) {
    var width = 400;
    var height = 0;
    if (panel && panel.getBoundingClientRect) {
      var rect = panel.getBoundingClientRect();
      if (rect.width) width = rect.width;
      if (rect.height) height = rect.height;
    }
    var margin = 8;
    var maxX = window.innerWidth - width - margin;
    if (maxX < margin) maxX = margin;      // panel wider than the window
    if (x > maxX) x = maxX;
    if (x < margin) x = margin;

    var maxY = height ? window.innerHeight - height - margin : window.innerHeight - 46;
    if (maxY < 0) maxY = 0;                // taller than the window: pin to top
    if (y > maxY) y = maxY;
    if (y < 0) y = 0;
    return { x: x, y: y };
  }

  function positionPanel(panel) {
    var pos = state.prefs.panelPos;
    if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
      // The panel is not in the document yet, so it cannot be measured here.
      // reclampPanel() re-runs the clamp against real dimensions once it is.
      var clamped = clampPanelPos(pos.x, pos.y);
      panel.style.left = clamped.x + 'px';
      panel.style.top = clamped.y + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    }
    // Otherwise the stylesheet's default (bottom-right) stands.
  }

  // Re-clamp against the panel's real height, after it is in the document.
  function reclampPanel() {
    var pos = state.prefs.panelPos;
    if (!pos || !ROOT) return;
    var panel = ROOT.querySelector('.uscistr-panel');
    if (!panel) return;
    var clamped = clampPanelPos(pos.x, pos.y, panel);
    panel.style.left = clamped.x + 'px';
    panel.style.top = clamped.y + 'px';
  }

  function resetPanelPosition() {
    state.prefs.panelPos = null;
    persistPrefs();
    render();
  }

  function startDrag(e) {
    // Let header buttons (refresh/settings/minimize) handle their own clicks.
    if (e.target && e.target.closest && e.target.closest('button')) return;
    var panel = e.currentTarget.parentNode;
    var rect = panel.getBoundingClientRect();
    dragState = { startX: e.clientX, startY: e.clientY, origX: rect.left, origY: rect.top, panel: panel };
    // classList, not className. Assigning the whole string wiped every other
    // class on the panel — including uscistr-is-wide, so one drag with a case
    // open dropped the panel back to 400px while its body kept the two-column
    // grid, giving a 150px detail column that rendered the case title one
    // character per line.
    panel.classList.add('uscistr-is-dragging');
    document.addEventListener('mousemove', onDragMove);
    document.addEventListener('mouseup', onDragEnd);
    e.preventDefault();
  }

  function onDragMove(e) {
    if (!dragState) return;
    var x = dragState.origX + (e.clientX - dragState.startX);
    var y = dragState.origY + (e.clientY - dragState.startY);
    var clamped = clampPanelPos(x, y, dragState.panel);
    dragState.panel.style.left = clamped.x + 'px';
    dragState.panel.style.top = clamped.y + 'px';
    dragState.panel.style.right = 'auto';
    dragState.panel.style.bottom = 'auto';
  }

  function onDragEnd() {
    if (!dragState) return;
    var rect = dragState.panel.getBoundingClientRect();
    dragState.panel.classList.remove('uscistr-is-dragging');
    state.prefs.panelPos = { x: rect.left, y: rect.top };
    persistPrefs();
    dragState = null;
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragEnd);
  }

  // ---- launcher pill --------------------------------------------------------

  function changedCaseCount() {
    var count = 0;
    for (var i = 0; i < state.cases.length; i++) {
      if (state.cases[i].changedSince) count++;
    }
    return count;
  }

  function brandMark(className) {
    var mark = el('div', { 'class': className });
    // Inline style beats the universal reset's `background: none` — this is
    // the one place the sheet expects an inline paint (02 §5.1).
    mark.style.background = 'linear-gradient(140deg, #2C7A75 0%, #14403E 100%)';
    return mark;
  }

  function buildPill() {
    var changed = changedCaseCount();
    var children = [
      brandMark('uscistr-pill-mark'),
      el('span', { 'class': 'uscistr-pill-label uscistr-brand-name', text: 'CaseLens' })
    ];
    if (state.cases.length) {
      // aria-hidden on the visible glyphs, because the accessible name below
      // says the same thing in words. A bare numeral and a coloured dot are
      // legible to someone looking at them and meaningless read aloud.
      children.push(el('span', {
        'class': 'uscistr-pill-count', 'aria-hidden': 'true', text: String(state.cases.length)
      }));
    }
    if (changed > 0) {
      children.push(el('span', { 'class': 'uscistr-pill-dot', 'aria-hidden': 'true' }));
    }

    var spoken = 'Open CaseLens';
    if (state.cases.length) spoken += ', tracking ' + plural(state.cases.length, 'case');
    if (changed > 0) spoken += ', ' + plural(changed, 'case') + ' changed since you last looked';

    return el('button', {
      'class': 'uscistr-pill',
      type: 'button',
      title: changed > 0
        ? 'Open CaseLens (Alt+U) — ' + plural(changed, 'case') + ' changed since you last looked'
        : 'Open CaseLens (Alt+U) — ' + plural(state.cases.length, 'case'),
      'aria-label': spoken,
      onclick: function () {
        state.prefs.collapsed = false;
        persistPrefs();
        render();
      }
    }, children);
  }

  // ---- panel: header, banner, add-case form, empty state, footer ------------

  function iconButton(iconName, label, onClick, extraClass) {
    var btn = el('button', {
      // Stable across a rebuild even though some of these swap their icon.
      'data-focus-key': 'icon:' + label,
      'class': 'uscistr-icon-btn' + (extraClass ? ' ' + extraClass : ''),
      type: 'button',
      title: label,
      'aria-label': label,
      onclick: onClick
    });
    var icon = buildIcon(iconName);
    if (icon) btn.appendChild(icon);
    return btn;
  }

  function anyCaseLoading() {
    for (var i = 0; i < state.cases.length; i++) {
      if (state.cases[i].loading) return true;
    }
    return false;
  }

  // Newest check that actually returned something. A failed attempt is not a
  // check: reporting one as "checked just now" tells someone their cases were
  // looked at when nothing was learned.
  function newestFetchedAt() {
    var newest = null;
    for (var i = 0; i < state.cases.length; i++) {
      var result = state.cases[i].result;
      if (!result || !result.succeededAt) continue;
      var ms = parseUscisDate(result.succeededAt);
      if (ms !== null && (newest === null || ms > newest)) newest = ms;
    }
    if (newest !== null) return newest;

    // Nothing succeeded this session; fall back to the stored snapshots, which
    // are only ever written from a successful read.
    var snapshots = load(STORAGE_KEYS.snapshots, {});
    for (var key in snapshots) {
      if (!snapshots.hasOwnProperty(key) || !snapshots[key]) continue;
      var snapMs = parseUscisDate(snapshots[key].at);
      if (snapMs !== null && (newest === null || snapMs > newest)) newest = snapMs;
    }
    return newest;
  }

  // Cases whose most recent attempt failed outright.
  function failedCaseCount() {
    var failed = 0;
    for (var i = 0; i < state.cases.length; i++) {
      var entry = state.cases[i];
      if (entry.loading || !entry.result) continue;
      if (!entry.result.succeededAt) failed++;
    }
    return failed;
  }

  // How many cases are asking something of this person right now.
  function demandingCaseCount() {
    var count = 0;
    for (var i = 0; i < state.cases.length; i++) {
      if (!state.cases[i].result) continue;
      if (collapsedDemands(buildCaseView(state.cases[i])).length) count++;
    }
    return count;
  }

  // The subtitle as elements, so the two counts that mean something can carry
  // weight. It used to be one concatenated string in the lightest ink in the
  // panel — "2 with something new" styled identically to "nothing new", which
  // is the one distinction the line exists to draw.
  function buildSubtitle() {
    var parts = headerSubtitle();
    if (typeof parts === 'string') {
      return el('div', { 'class': 'uscistr-subtitle', text: parts });
    }
    var wrap = el('div', { 'class': 'uscistr-subtitle' });
    for (var i = 0; i < parts.length; i++) {
      if (i) wrap.appendChild(el('span', { 'class': 'uscistr-subtitle-sep', text: ' · ' }));
      var part = parts[i];
      if (typeof part === 'string') {
        wrap.appendChild(el('span', { text: part }));
      } else {
        wrap.appendChild(el('span', { 'class': 'uscistr-subtitle-' + part.tone, text: part.text }));
      }
    }
    return wrap;
  }

  // One line answering "anything new anywhere?" before the user reads a card.
  function headerSubtitle() {
    if (!state.cases.length) return 'No cases tracked yet';
    var parts = [plural(state.cases.length, 'case')];
    var changed = changedCaseCount();
    var failed = failedCaseCount();
    var needsYou = demandingCaseCount();
    var newest = newestFetchedAt();

    // A deadline outranks a change: "something changed" is interesting,
    // "USCIS is waiting for you" has a consequence. The summary aggregated
    // only changes, so the second half of the glance question — does anything
    // need me — could only be answered by scanning every row.
    if (needsYou > 0) {
      parts.push({ text: needsYou + ' needing you', tone: 'demand' });
    }

    // "nothing new" is a claim about the cases. It may only be made when we
    // actually heard back. When checks failed we learned nothing, which is a
    // different statement and has to read differently.
    if (changed > 0) {
      parts.push({ text: changed + ' with something new', tone: 'changed' });
    } else if (failed > 0) {
      parts.push({ text: "couldn't check " + failed, tone: 'demand' });
    } else if (newest !== null && needsYou === 0) {
      parts.push('nothing new');
    }

    if (anyCaseLoading()) {
      parts.push('checking now');
    } else if (failed > 0) {
      parts.push(newest !== null
        ? 'last successful check ' + relativeDate(new Date(newest).toISOString())
        : 'not checked yet');
    } else if (newest !== null) {
      parts.push('checked ' + relativeDate(new Date(newest).toISOString()));
    }
    return parts;
  }

  function buildHeader() {
    var refreshBtn = iconButton('refresh', 'Refresh all cases', function (e) {
      e.stopPropagation();
      refreshAll();
    }, anyCaseLoading() ? 'uscistr-is-busy' : null);

    var gearBtn = iconButton('gear', 'Settings', function (e) {
      e.stopPropagation();
      uiState.settingsOpen = !uiState.settingsOpen;
      render();
    }, uiState.settingsOpen ? 'uscistr-is-on' : null);
    // The outside-click handler runs on mousedown, before this click fires.
    // Without this marker it would close the popover a moment before the gear
    // reopened it, and the button would never appear to toggle off.
    gearBtn.setAttribute('data-uscistr-settings-toggle', '1');

    var minBtn = iconButton('minimize', 'Minimize', function (e) {
      e.stopPropagation();
      state.prefs.collapsed = true;
      // The panel is leaving the screen, so the next open is a real entrance
      // and should animate again.
      uiState.panelMounted = false;
      persistPrefs();
      render();
    });

    return el('div', { 'class': 'uscistr-header', onmousedown: startDrag }, [
      el('div', { 'class': 'uscistr-brand' }, [
        brandMark('uscistr-mark'),
        el('div', { 'class': 'uscistr-titles' }, [
          el('div', { 'class': 'uscistr-title uscistr-brand-name', text: 'CaseLens' }),
          buildSubtitle()
        ])
      ]),
      el('span'),
      el('div', { 'class': 'uscistr-header-actions' }, [refreshBtn, gearBtn, minBtn])
    ]);
  }

  function banner(variant, iconName, title, lines, actions) {
    var body = el('div', { 'class': 'uscistr-banner-body' }, [
      el('div', { 'class': 'uscistr-banner-title', text: title })
    ]);
    for (var i = 0; i < lines.length; i++) {
      if (!lines[i]) continue;
      body.appendChild(el('div', { 'class': 'uscistr-banner-text', text: lines[i] }));
    }
    var wrap = el('div', {
      'class': 'uscistr-banner' + (variant ? ' uscistr-banner-' + variant : ''),
      role: 'status'
    });
    var icon = buildIcon(iconName);
    wrap.appendChild(icon || el('span'));
    wrap.appendChild(body);
    wrap.appendChild(actions || el('span'));
    return wrap;
  }

  // Three jobs, in order: name the cause, say it is neither the user's fault
  // nor a data loss, give exactly one action.
  function buildSessionBanner() {
    var actions = el('div', { 'class': 'uscistr-banner-actions' }, [
      el('button', {
        'class': 'uscistr-btn uscistr-btn-sm', type: 'button', text: 'Refresh',
        onclick: function () { refreshAll(); }
      })
    ]);
    return banner('', 'warning', 'Your USCIS sign-in has timed out.', [
      'This happens on the USCIS site too, after a period of inactivity.',
      'Your saved cases and history are safe in this browser.',
      'Sign in again at my.uscis.gov, then choose Refresh.'
    ], actions);
  }

  // The tool's whole method is comparing today against what it saved
  // yesterday. If the browser won't let it save, it cannot do that — and the
  // failure is invisible from the outside, because the panel still renders and
  // still shows the current status. Someone in private browsing would be
  // watching a change tracker that had silently stopped tracking changes.
  function buildStorageBanner() {
    if (!state.storageBlocked) return null;
    return banner('', 'warning', "This browser won't let CaseLens save anything.", [
      'A change was detected on one of your cases and could not be recorded, so it will ' +
        'not appear in the timeline and you will not be told about it again.',
      'This is usually private browsing, or storage being full or blocked for this site. ' +
        'Your cases at USCIS are unaffected.'
    ]);
  }

  // Every card collapses by default, and every failure message lived inside an
  // expanded card — so a check that failed for every case produced a panel
  // indistinguishable from a healthy one, with rows drawn from cache and a
  // header reading "last successful check just now". The one state a tracker
  // must never render silently is "I could not read USCIS at all".
  //
  // Session timeouts have their own banner with its own recovery step, so this
  // covers everything else.
  function buildFetchFailureBanner() {
    if (state.sessionExpired) return null;
    var failed = 0;
    var checked = 0;
    for (var i = 0; i < state.cases.length; i++) {
      var result = state.cases[i].result;
      if (!result) continue;
      checked++;
      // The same test the header uses. Asking whether the two core endpoints
      // *errored* missed the case where every endpoint returned 200 with an
      // empty envelope: the header correctly said "couldn't check 4" while no
      // banner appeared at all, because nothing had technically failed.
      if (!resultHasAnyData(result)) failed++;
    }
    if (!failed) return null;

    var all = failed === checked;
    var actions = el('div', { 'class': 'uscistr-banner-actions' }, [
      el('button', {
        'class': 'uscistr-btn uscistr-btn-sm', type: 'button', text: 'Try again',
        onclick: function () { refreshAll(); }
      })
    ]);
    return banner('', 'warning', all
      ? "Couldn't read your cases from USCIS on the last check."
      : plural(failed, 'case') + " couldn't be read on the last check.", [
      'Your case at USCIS is unaffected — this is about reading the record, not about the case.',
      'Anything shown below is the last copy this browser saved, and is dated.'
    ], actions);
  }

  function addCase(number, label) {
    for (var i = 0; i < state.cases.length; i++) {
      if (state.cases[i].number === number) return; // duplicate: skip silently
    }
    state.cases.push(makeCaseEntry({ number: number, label: label }));
    // Adding a case back is an explicit undo of any earlier removal.
    setDismissed(number, false);
    persistCases();
    uiState.addOpen = false;
    uiState.addNumberValue = '';
    uiState.addLabelValue = '';
    uiState.addError = null;
    uiState.addPendingNumber = null;
    render();
    refreshCase(number);
  }

  function handleAddCase(rawNumber, rawLabel) {
    var number = (rawNumber || '').trim().toUpperCase();
    var label = (rawLabel || '').trim();
    if (!number) return;

    // Neither branch is a hard block: a person holding a receipt notice knows
    // better than this regular expression.
    if (!CASE_NUMBER_RE.test(number)) {
      uiState.addNumberValue = number;
      uiState.addLabelValue = label;
      uiState.addError = 'That does not look like a receipt number. A receipt number is 13 characters: ' +
        'three letters and ten digits, like IOE0912345678, printed on your I-797C notice.';
      uiState.addPendingNumber = number;
      render();
      return;
    }
    if (!ONLINE_PREFIX_RE.test(number)) {
      uiState.addNumberValue = number;
      uiState.addLabelValue = label;
      uiState.addError = 'That is a valid receipt number, but it was not filed through a USCIS ' +
        'online account. This panel reads the same account API the website uses, which only ' +
        'covers cases beginning IOE — so it will most likely find nothing for this one.';
      uiState.addPendingNumber = number;
      render();
      return;
    }
    addCase(number, label);
  }

  // Cases are discovered from the account page automatically, so for almost
  // everyone this form is something to scroll past. It used to sit permanently
  // open above the case list, which meant a returning user met two empty text
  // inputs before their own case.
  function buildAddCaseSection() {
    if (!uiState.addOpen && !uiState.addError) {
      return el('button', {
        'class': 'uscistr-add-toggle', type: 'button', text: '+ Add a case by receipt number',
        onclick: function () { uiState.addOpen = true; render(); }
      });
    }
    return buildAddCaseForm();
  }

  function buildAddCaseForm() {
    var numberInput = el('input', {
      'class': 'uscistr-input uscistr-mono' + (uiState.addError ? ' uscistr-is-invalid' : ''),
      type: 'text',
      placeholder: 'IOE receipt number',
      'aria-label': 'Receipt number',
      'data-focus-key': 'addNumber',
      value: uiState.addNumberValue,
      // Clearing the field clears the complaint about it. Without this the
      // error block pinned itself to the top of the panel until a successful
      // add or a page reload.
      oninput: function (e) {
        uiState.addNumberValue = e.target.value;
        if (uiState.addError) { uiState.addError = null; uiState.addPendingNumber = null; render(); }
      }
    });
    var labelInput = el('input', {
      'class': 'uscistr-input', type: 'text', placeholder: 'Nickname (optional)',
      'aria-label': 'Nickname for this case', 'data-focus-key': 'addLabel',
      value: uiState.addLabelValue,
      oninput: function (e) { uiState.addLabelValue = e.target.value; }
    });
    var addBtn = el('button', { 'class': 'uscistr-btn uscistr-btn-primary', type: 'submit', text: 'Add' });

    var form = el('form', {
      'class': 'uscistr-add-form',
      onsubmit: function (e) {
        e.preventDefault();
        handleAddCase(numberInput.value, labelInput.value);
      }
    }, [numberInput, labelInput, addBtn]);

    if (uiState.addError) {
      form.appendChild(el('div', { 'class': 'uscistr-add-error' }, [
        el('div', { 'class': 'uscistr-field-error', text: uiState.addError }),
        el('button', {
          'class': 'uscistr-btn uscistr-btn-sm uscistr-btn-outline', type: 'button', text: 'Add anyway',
          onclick: function () {
            addCase(uiState.addPendingNumber, (uiState.addLabelValue || '').trim());
          }
        }),
        el('button', {
          'class': 'uscistr-btn uscistr-btn-sm uscistr-btn-quiet', type: 'button', text: 'Cancel',
          onclick: function () { closeAddCase(); }
        })
      ]));
    } else {
      form.appendChild(el('button', {
        'class': 'uscistr-btn uscistr-btn-sm uscistr-btn-quiet', type: 'button', text: 'Cancel',
        onclick: function () { closeAddCase(); }
      }));
    }
    return form;
  }

  function closeAddCase() {
    uiState.addOpen = false;
    uiState.addError = null;
    uiState.addPendingNumber = null;
    uiState.addNumberValue = '';
    uiState.addLabelValue = '';
    render();
  }

  // Never "0 cases" and never "you have none": a person logged into USCIS who
  // is told they have no cases reads it as their case being gone.
  function buildEmptyState() {
    var wrap = el('div', { 'class': 'uscistr-empty' });
    var iconWrap = el('div', { 'class': 'uscistr-empty-icon' });
    var icon = buildIcon('search');
    if (icon) iconWrap.appendChild(icon);
    wrap.appendChild(iconWrap);
    wrap.appendChild(el('div', { 'class': 'uscistr-empty-title', text: 'No cases found on your account yet.' }));
    wrap.appendChild(el('div', {
      'class': 'uscistr-empty-text',
      text: "If you know a receipt number, add it above — it's the 13-character code starting with IOE on your I-797C notice from USCIS."
    }));
    return wrap;
  }

  // The export is a person's record of their own immigration data, shaped
  // for reading — grouped per case, endpoints labelled, everything USCIS
  // returned on the latest successful check included verbatim. It is NOT a
  // tool-state backup and nothing imports it: a new install reads the account
  // page fresh, and this file is what someone keeps, or hands an attorney.
  // Raw responses exist only in memory after a successful check, so each
  // case says explicitly when its responses are absent rather than omitting
  // them silently — "no successful check" and "nothing to include" are
  // different statements.
  function buildExportPayload() {
    var history = load(STORAGE_KEYS.history, {});
    var cases = [];
    for (var i = 0; i < state.cases.length; i++) {
      var entry = state.cases[i];
      var num = String(entry.number).toUpperCase();
      var item = {
        receiptNumber: entry.number,
        nickname: entry.label || null,
        addedAt: entry.addedAt ? new Date(entry.addedAt).toISOString() : null,
        lastKnownSummary: getSnapshot(entry.number) || null,
        changeHistory: history[num] || [],
        uscisResponses: null
      };
      if (entry.result) {
        item.checkedAt = entry.result.fetchedAt || null;
        item.uscisResponses = {
          caseDetail: entry.result.caseDetail,
          caseStatus: entry.result.caseStatus,
          documents: entry.result.documents,
          receiptInfo: entry.result.location,
          processingTimes: entry.result.processingTimes
        };
      } else {
        item.uscisResponsesNote = 'No successful check in this browser session, so the raw ' +
          'responses are not available to include. Refresh, then export again.';
      }
      cases.push(item);
    }
    return {
      kind: 'caselens-record',
      version: VERSION,
      exportedAt: new Date().toISOString(),
      note: 'Everything USCIS returned about these cases on the latest check, plus the ' +
        'changes CaseLens observed between checks. Exported by CaseLens, an unofficial ' +
        'tool; my.uscis.gov and mailed notices are the authority on any case.',
      cases: cases
    };
  }

  // ==========================================================================
  // The printable record (docs/design/06-print-record.md)
  // ==========================================================================
  // The second way a record leaves this panel. The JSON file above is the
  // archive; this is the thing a person hands to an attorney. Same data, laid
  // out to be read on paper.
  //
  // Everything below is a PURE builder: entries in, detached DOM out, no
  // reading of state.prefs and no touching of the live document. The redaction
  // choice arrives in `opts` because it is made per print, not read from the
  // stored setting — see redactValueWith. That purity is what makes the whole
  // document fuzzable for the one property that matters: a masked copy must
  // never render a sensitive value at any depth.
  //
  // Three rules this document lives by, all of them load-bearing:
  //
  //   1. No anchors, no images, no icons. my.uscis.gov's own print stylesheet
  //      carries `a[href]::after { content: " (" attr(href) ")" }` and
  //      `img { display: none !important }`. An anchor here would have raw
  //      URLs splattered through it by a rule this project does not control.
  //      buildIcon's SVG paints only via CSS classes, so icons would print as
  //      invisible boxes. Text only, throughout.
  //   2. Nothing collapsed. Every disclosure the panel folds — timeline beyond
  //      four, nested record groups, the raw JSON — is rendered open here.
  //      Paper has no click.
  //   3. It never looks official. No seal, no eagle, no agency mark, no
  //      federal blue, no signature line. The word "Unofficial" leads the
  //      document and closes every case block.
  var PRINT_UNOFFICIAL = 'Unofficial document. Not issued by USCIS.';

  // Where each timeline row came from, in words. A printed timeline handed to
  // an attorney has to separate what the agency reported from what this panel
  // noticed between two checks; on screen that distinction is carried by a
  // glyph, and a glyph does not survive a photocopier.
  var PRINT_PROVENANCE = {
    official: 'reported by USCIS',
    coded: 'reported by USCIS',
    notice: 'reported by USCIS',
    document: 'reported by USCIS',
    anchor: 'from the filing date',
    local: 'observed by CaseLens between checks'
  };

  function printHeading(text) {
    return el('div', { 'class': 'uscistr-print-h', text: text });
  }

  function printNote(text) {
    return el('div', { 'class': 'uscistr-print-note', text: text });
  }

  function printRow(label, value) {
    return el('div', { 'class': 'uscistr-print-row' }, [
      el('span', { 'class': 'uscistr-print-key', text: label }),
      el('span', { 'class': 'uscistr-print-val', text: value })
    ]);
  }

  // The facts block skips a row it has no answer for. The appendix does not —
  // there, a field USCIS sent empty is different from one it never sent, and
  // that distinction is the whole point of printing the raw data.
  function printRowIf(parent, label, value) {
    if (value === null || value === undefined || value === '') return;
    parent.appendChild(printRow(label, String(value)));
  }

  function printDateAndTime(ms, precision) {
    if (ms === null || ms === undefined) return null;
    var text = formatDateFull(ms);
    if (precision && precision !== 'day') {
      text += ' at ' + formatTimeOfDay(ms) + ' ' + localZoneLabel(ms);
    }
    return text;
  }

  function buildPrintCover(entries, opts) {
    var cover = el('div', { 'class': 'uscistr-print-cover' });
    cover.appendChild(el('div', { 'class': 'uscistr-print-title', text: 'USCIS case record' }));
    cover.appendChild(el('div', { 'class': 'uscistr-print-warn', text: PRINT_UNOFFICIAL }));
    cover.appendChild(printNote(STANDING_DISCLAIMER));

    var facts = el('div', { 'class': 'uscistr-print-block' });
    printRowIf(facts, 'Generated', printDateAndTime(opts.generatedAt, 'time'));
    printRowIf(facts, 'Prepared by',
      'CaseLens v' + VERSION + ', an open-source browser panel. github.com/itsericqiu/uscis-caselens');
    printRowIf(facts, 'Covers', entries.length === 1
      ? 'One case, ' + numberFor(entries[0].number, opts.redact)
      : plural(entries.length, 'case'));
    // A masked copy mistaken for a complete one is the worst thing this
    // document can do, so which one it is gets stated, not implied.
    printRowIf(facts, 'Completeness', opts.redact
      ? 'Masked copy. Receipt numbers, names and addresses are hidden. This is not the complete record.'
      : 'Full record. Contains names, addresses and full receipt numbers.');
    cover.appendChild(facts);
    return cover;
  }

  function buildPrintFacts(entry, view, opts) {
    var block = el('div', { 'class': 'uscistr-print-block' });
    var detail = view.detail;
    var notice = view.notice;

    printRowIf(block, 'Receipt number', numberFor(entry.number, opts.redact));
    if (entry.label) printRowIf(block, 'Nickname', entry.label);
    printRowIf(block, 'Form', detail && detail.formType ? detail.formType : null);
    printRowIf(block, 'Form name', detail && detail.formName ? detail.formName : null);

    var filed = detail && detail.submissionDate ? parseUscisDate(detail.submissionDate) : null;
    if (filed !== null) {
      var elapsed = daysBetween(filed, Date.now());
      printRowIf(block, 'Filed', formatDateFull(filed) + ' · ' + longDuration(elapsed) + ' ago');
    }
    printRowIf(block, 'Office', view.office);
    printRowIf(block, 'Office code', view.officeCode);
    printRowIf(block, 'Representative',
      detail && detail.representativeName
        ? (opts.redact ? '[hidden]' : String(detail.representativeName))
        : null);
    if (detail && detail.backendAt) {
      var touched = parseUscisDate(detail.backendAt);
      if (touched !== null) printRowIf(block, 'Record last updated', formatDateFull(touched));
    }
    if (view.estimateMonths !== null && view.estimateMonths !== undefined) {
      block.appendChild(printRow('Processing estimate',
        plural(view.estimateMonths, 'month') + ' — a range USCIS publishes, not a promise about this case'));
    }
    if (detail && detail.actionRequired) printRowIf(block, 'Action required', 'Yes, according to this record');
    if (view.evidenceCount) printRowIf(block, 'Evidence requests', String(view.evidenceCount));
    if (detail && detail.premium) printRowIf(block, 'Premium processing', 'Yes');
    if (detail && detail.closed) printRowIf(block, 'Case closed', 'Yes, according to this record');
    printRowIf(block, 'Status code', notice && notice.actionCode ? notice.actionCode : null);
    return block;
  }

  function buildPrintStages(entry, view) {
    var info = stageInfo(entry, view);
    var wrap = el('div', { 'class': 'uscistr-print-block' });
    wrap.appendChild(printHeading('Steps this record shows'));
    if (!info.stages.length) {
      wrap.appendChild(printNote('No steps could be read from this record.'));
      return wrap;
    }
    // The panel collapses these into segments to fit 400px. Paper has room, so
    // every step is printed with its state spelled out.
    for (var i = 0; i < info.stages.length; i++) {
      var stage = info.stages[i];
      var said;
      if (stage.state === 'not-reported') said = 'not reported in this data';
      else if (stage.state === 'ahead') said = 'not reached in this record';
      else if (stage.state === 'current') said = 'where this case sits now';
      else said = stage.at ? formatDateFull(stage.at) : 'shown by this record';
      wrap.appendChild(el('div', { 'class': 'uscistr-print-stage' }, [
        el('span', { 'class': 'uscistr-print-key', text: stage.label }),
        el('span', { 'class': 'uscistr-print-val', text: said })
      ]));
    }
    wrap.appendChild(printNote(
      '"Not reported" means USCIS does not publish that step through the data this panel can read. ' +
      'It does not mean the step did not happen.'));
    if (info.unmapped && info.unmapped.length) {
      wrap.appendChild(printNote(
        'Codes in this record with no published meaning: ' + info.unmapped.join(', ') + '.'));
    }
    return wrap;
  }

  function buildPrintTimeline(entry, view, opts) {
    var wrap = el('div');
    wrap.appendChild(printHeading('Timeline'));
    var items = (view.upcoming || []).concat(view.items || []);
    if (!items.length) {
      wrap.appendChild(printNote('No dated events could be read from this record.'));
      return wrap;
    }
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var row = el('div', { 'class': 'uscistr-print-event' });
      var when = printDateAndTime(item.displayAt, item.precision);
      row.appendChild(el('span', { 'class': 'uscistr-print-key', text: when || 'Date not given' }));
      var body = el('span', { 'class': 'uscistr-print-val' });
      var label = item.label ? String(item.label) : (item.code ? String(item.code) : 'Event');
      body.appendChild(el('span', { text: label }));
      if (item.code) body.appendChild(el('span', { 'class': 'uscistr-print-prov', text: ' [' + item.code + ']' }));
      if (item.fileName) {
        body.appendChild(el('span', { 'class': 'uscistr-print-prov',
          text: ' · ' + fileNameFor(item.fileName, opts.redact) }));
      }
      body.appendChild(el('span', { 'class': 'uscistr-print-prov',
        text: ' · ' + (PRINT_PROVENANCE[item.provenance] || 'source not recorded') }));
      row.appendChild(body);
      wrap.appendChild(row);
    }
    return wrap;
  }

  function buildPrintDocsList(entry, view, opts) {
    var wrap = el('div');
    wrap.appendChild(printHeading('Documents USCIS lists'));
    var docs = view.docs || [];
    if (!docs.length) {
      wrap.appendChild(printNote('No documents are listed on this case.'));
      return wrap;
    }
    for (var i = 0; i < docs.length; i++) {
      var doc = docs[i];
      var at = doc.date ? parseUscisDate(doc.date) : null;
      var parts = [];
      if (doc.type) parts.push(String(doc.type));
      if (at !== null) parts.push(formatDateFull(at));
      wrap.appendChild(printRow(
        fileNameFor(doc.name || 'Document', opts.redact),
        parts.length ? parts.join(' · ') : 'no date given'));
    }
    wrap.appendChild(printNote(
      'These files live in the USCIS account and can be downloaded there. They are named here, not copied.'));
    return wrap;
  }

  function buildPrintChanges(view, opts) {
    var wrap = el('div');
    wrap.appendChild(printHeading('Changes this panel recorded'));
    var history = view.history || [];
    if (!history.length) {
      wrap.appendChild(printNote('No changes have been recorded for this case in this browser.'));
      return wrap;
    }
    // USCIS publishes no change log, so this is the one section of the record
    // the agency cannot reproduce. It is this panel's observation, and it is
    // labelled as such.
    wrap.appendChild(printNote(
      'Observed by CaseLens by comparing one check against the previous one. Not an agency record.'));
    for (var i = 0; i < history.length; i++) {
      var change = history[i];
      var at = change.at ? parseUscisDate(change.at) : null;
      var said;
      if (change.kind === 'document') said = 'New document listed: ' + fileNameFor(change.to, opts.redact);
      else if (change.kind === 'backend') said = 'USCIS touched the record without changing the status wording';
      else if (change.kind === 'office') said = 'Office changed to ' + String(change.to);
      else said = 'Status became: ' + String(change.to);
      wrap.appendChild(el('div', { 'class': 'uscistr-print-event' }, [
        el('span', { 'class': 'uscistr-print-key', text: at !== null ? formatDateFull(at) : 'Date not given' }),
        el('span', { 'class': 'uscistr-print-val', text: said })
      ]));
    }
    return wrap;
  }

  function buildPrintCase(entry, opts) {
    var view = buildCaseView(entry);
    var block = el('div', { 'class': 'uscistr-print-case' });

    var title = entry.label ? entry.label : (view.detail && view.detail.formType ? view.detail.formType : 'Case');
    block.appendChild(el('div', { 'class': 'uscistr-print-h',
      text: title + ' — ' + numberFor(entry.number, opts.redact) }));

    // When the data was true is the first thing a reader needs, because a
    // printed page carries no hint that it has gone stale.
    var asOf = view.checkedAt || view.cachedAt || null;
    if (asOf) {
      block.appendChild(printNote('As of ' + printDateAndTime(asOf, 'time') +
        ' — when USCIS was last read successfully. The case may have changed since.'));
    } else {
      block.appendChild(printNote('This case had no successful check in this browser session.'));
    }
    if (view.fromCache) {
      block.appendChild(printNote('Drawn from the last stored check, because the most recent attempt failed.'));
    }

    if (view.notice && view.notice.status) {
      var status = el('div', { 'class': 'uscistr-print-block' });
      status.appendChild(printHeading('Status, in USCIS’s wording'));
      status.appendChild(el('div', { 'class': 'uscistr-print-val', text: view.notice.status }));
      if (view.notice.statusDetail) {
        status.appendChild(el('div', { 'class': 'uscistr-print-note', text: view.notice.statusDetail }));
      }
      block.appendChild(status);
    }

    block.appendChild(buildPrintFacts(entry, view, opts));
    block.appendChild(buildPrintStages(entry, view));
    block.appendChild(buildPrintTimeline(entry, view, opts));
    block.appendChild(buildPrintDocsList(entry, view, opts));
    block.appendChild(buildPrintChanges(view, opts));
    block.appendChild(el('div', { 'class': 'uscistr-print-meta', text: PRINT_UNOFFICIAL }));
    return block;
  }

  // The eager counterpart of buildRecordValue. Same walk, same order, same
  // depth cap — but it renders open, with no button anywhere, because the
  // screen version fills a group only when it is clicked and paper cannot
  // click. Shares humanizeFieldKey and objectKeys so the two views label and
  // order fields identically.
  function buildPrintValue(key, value, depth, redact) {
    if (depth > RECORD_MAX_DEPTH) {
      return printRow(humanizeFieldKey(key), 'nested deeper than this document prints');
    }
    if (Array.isArray(value)) {
      return buildPrintGroup(humanizeFieldKey(key) + ' (' + value.length + ')', value, depth, true, redact);
    }
    if (value !== null && typeof value === 'object') {
      return buildPrintGroup(humanizeFieldKey(key), value, depth, false, redact);
    }
    var shown;
    if (value === null) shown = '—';
    else if (value === '') shown = '(empty)';
    else shown = String(redactValueWith(key, value, redact));
    return printRow(humanizeFieldKey(key), shown);
  }

  function buildPrintGroup(label, value, depth, isArray, redact) {
    var wrap = el('div', { 'class': 'uscistr-print-group' });
    wrap.appendChild(el('div', { 'class': 'uscistr-print-key', text: label }));
    var i;
    if (isArray) {
      if (!value.length) {
        wrap.appendChild(printNote('USCIS sent this list with nothing in it.'));
        return wrap;
      }
      for (i = 0; i < value.length; i++) {
        wrap.appendChild(buildPrintValue('#' + (i + 1), value[i], depth + 1, redact));
      }
      return wrap;
    }
    var keys = objectKeys(value);
    if (!keys.length) {
      wrap.appendChild(printNote('USCIS sent this with nothing in it.'));
      return wrap;
    }
    for (i = 0; i < keys.length; i++) {
      wrap.appendChild(buildPrintValue(keys[i], value[keys[i]], depth + 1, redact));
    }
    return wrap;
  }

  function buildPrintFields(data, redact) {
    var wrap = el('div', { 'class': 'uscistr-print-fields' });
    var body = (data && typeof data === 'object' && 'data' in data) ? data.data : data;
    if (body === null || body === undefined) {
      wrap.appendChild(printNote('USCIS answered with no content for this one.'));
      return wrap;
    }
    if (typeof body !== 'object') {
      wrap.appendChild(buildPrintValue('Value', body, 0, redact));
      return wrap;
    }
    if (Array.isArray(body)) {
      if (!body.length) {
        wrap.appendChild(printNote('USCIS answered with an empty list.'));
        return wrap;
      }
      for (var a = 0; a < body.length; a++) {
        wrap.appendChild(buildPrintValue('#' + (a + 1), body[a], 0, redact));
      }
      return wrap;
    }
    var keys = responseKeys(body);
    if (!keys.length) {
      wrap.appendChild(printNote('USCIS answered with no content for this one.'));
      return wrap;
    }
    for (var i = 0; i < keys.length; i++) {
      wrap.appendChild(buildPrintValue(keys[i], body[keys[i]], 0, redact));
    }
    return wrap;
  }

  function buildPrintAppendix(entries, opts) {
    var wrap = el('div', { 'class': 'uscistr-print-appendix' });
    wrap.appendChild(el('div', { 'class': 'uscistr-print-title', text: 'Everything USCIS sent' }));
    wrap.appendChild(printNote(
      'The rest of this document is the data USCIS returned to this browser, unreshaped. Field names ' +
      'are USCIS’s own, made readable; values are printed as they arrived, in the order they arrived.'));

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var caseWrap = el('div', { 'class': 'uscistr-print-section' });
      caseWrap.appendChild(printHeading(numberFor(entry.number, opts.redact)));
      if (!entry.result) {
        // Word for word what the JSON export says in the same situation, so
        // the two record formats never disagree about why data is missing.
        caseWrap.appendChild(printNote('No successful check in this browser session, so the raw ' +
          'responses are not available to include. Refresh, then export again.'));
        wrap.appendChild(caseWrap);
        continue;
      }
      var sections = caseResponses(entry);
      for (var s = 0; s < sections.length; s++) {
        var section = sections[s];
        var body = el('div', { 'class': 'uscistr-print-block' });
        body.appendChild(el('div', { 'class': 'uscistr-print-key',
          text: section.label + ' · ' + section.path + ' · ' + payloadStatus(section.data).text }));
        body.appendChild(buildPrintFields(section.data, opts.redact));
        caseWrap.appendChild(body);
      }
      wrap.appendChild(caseWrap);
    }
    return wrap;
  }

  // The whole document. One renderer for both entry points: the footer hands
  // it every case, a card hands it one, and nothing else differs — so a bug
  // cannot exist in one path and not the other.
  function buildPrintDocument(entries, opts) {
    var options = {
      redact: !!(opts && opts.redact),
      generatedAt: (opts && opts.generatedAt) || Date.now()
    };
    var list = entries || [];
    var doc = el('div', { 'class': 'uscistr-print' });
    doc.appendChild(buildPrintCover(list, options));
    if (!list.length) {
      doc.appendChild(printNote('No cases were saved in this browser when this document was made.'));
      return doc;
    }
    for (var i = 0; i < list.length; i++) {
      doc.appendChild(buildPrintCase(list[i], options));
    }
    doc.appendChild(buildPrintAppendix(list, options));
    doc.appendChild(el('div', { 'class': 'uscistr-print-foot' }, [
      el('span', { text: PRINT_UNOFFICIAL + ' my.uscis.gov and mailed notices are the authority. ' }),
      el('span', { text: 'CaseLens v' + VERSION + ' · End of record.' })
    ]));
    return doc;
  }

  // The only function in this file that touches the host document for the sake
  // of printing, and therefore the only one that changes if this ever has to
  // move into an off-screen iframe. It mounts the built document, flips the
  // body class the print stylesheet keys on, runs `go`, and always undoes all
  // of it.
  //
  // Teardown is idempotent and runs from two places — a `finally`, and the
  // browser's own afterprint event — because a print dialog that is dismissed,
  // a renderer that throws, and a browser that fires afterprint late are three
  // different exits from the same state. The screen-side rule that hides
  // `.uscistr-print` is a plain rule rather than part of the print block, so
  // even a teardown that never ran leaves nothing visible on screen.
  function withPrintMode(node, go) {
    var previousTitle = document.title;
    var done = false;
    function teardown() {
      if (done) return;
      done = true;
      try { window.removeEventListener('afterprint', teardown); } catch (e) {}
      if (node.parentNode) node.parentNode.removeChild(node);
      document.body.className = String(document.body.className)
        .replace(/\s*uscistr-printing\b/g, '');
      document.title = previousTitle;
    }

    ROOT.appendChild(node);
    document.body.className = String(document.body.className) + ' uscistr-printing';
    // The document title is what the browser offers as the default file name
    // in its "Save as PDF" dialog, so it is set to match the JSON export's
    // naming rather than leaving someone to save "my.uscis.gov.pdf".
    document.title = 'caselens-record-' + new Date().toISOString().slice(0, 10);
    try { window.addEventListener('afterprint', teardown); } catch (e) {}

    try {
      go();
    } finally {
      teardown();
    }
  }

  function printRecord(entries, redact) {
    var node = buildPrintDocument(entries, { redact: redact, generatedAt: Date.now() });
    withPrintMode(node, function () {
      // Blocks until the print dialog closes in every browser that matters.
      window.print();
    });
  }

  // Three outcomes — full record, masked copy, cancel — so this cannot be a
  // window.confirm, which has two and would force "cancel" to stand in for one
  // of the real choices. That is how a shared PDF ends up unmasked by accident.
  function buildPrintPopover(entries, closeFn) {
    var many = entries.length !== 1;
    var wrap = el('div', { 'class': 'uscistr-popover uscistr-print-choice' });
    wrap.appendChild(el('div', { 'class': 'uscistr-popover-label',
      text: many ? 'Print ' + plural(entries.length, 'case') : 'Print this case' }));
    wrap.appendChild(el('div', { 'class': 'uscistr-popover-desc',
      text: 'Opens the browser print dialog, where "Save as PDF" writes a file. ' +
        'Nothing is sent anywhere.' }));

    wrap.appendChild(el('button', {
      'class': 'uscistr-btn uscistr-btn-sm', type: 'button', text: 'Full record',
      onclick: function () { closeFn(); printRecord(entries, false); }
    }));
    wrap.appendChild(el('div', { 'class': 'uscistr-popover-desc',
      text: 'Names, addresses and full receipt numbers, as USCIS returned them.' }));

    wrap.appendChild(el('button', {
      'class': 'uscistr-btn uscistr-btn-sm uscistr-btn-outline', type: 'button', text: 'Masked copy',
      onclick: function () { closeFn(); printRecord(entries, true); }
    }));
    wrap.appendChild(el('div', { 'class': 'uscistr-popover-desc',
      text: 'Receipt numbers masked and names hidden, for sharing. Says on the page that it is not complete.' }));

    wrap.appendChild(el('button', {
      'class': 'uscistr-btn uscistr-btn-sm uscistr-btn-outline', type: 'button', text: 'Cancel',
      onclick: function () { closeFn(); render(); }
    }));
    return wrap;
  }

  // Resolves uiState.printFor to the cases it names: every case, or the one
  // whose receipt number it holds.
  function printSelection() {
    if (uiState.printFor === 'all') return state.cases.slice();
    for (var i = 0; i < state.cases.length; i++) {
      if (String(state.cases[i].number).toUpperCase() === String(uiState.printFor).toUpperCase()) {
        return [state.cases[i]];
      }
    }
    return [];
  }

  function buildPrintChoice() {
    if (!uiState.printFor) return null;
    var entries = printSelection();
    if (!entries.length) { uiState.printFor = null; return null; }
    return buildPrintPopover(entries, function () { uiState.printFor = null; });
  }

  function exportRecord() {
    // The file is unencrypted and deliberately unredacted, whatever "Hide
    // receipt numbers" is set to — a masked record is not a record. Someone
    // about to email this to themselves, or drop it in shared cloud storage,
    // should know what it carries before the download lands, not after.
    var ok = window.confirm(
      'Save your case records as a file?\n\n' +
      'The file will contain everything USCIS returned about your cases — ' +
      'including names, addresses, and full receipt numbers — plus every ' +
      'change this panel has recorded, as plain, unencrypted text.\n\n' +
      'Keep it somewhere you would keep a copy of your immigration notices.');
    if (!ok) return;

    var payload = buildExportPayload();
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var dateStr = new Date().toISOString().slice(0, 10);
    var a = el('a', { href: url, download: 'caselens-record-' + dateStr + '.json' });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Always present, never dismissible: the panel is a mirror, and it says so.
  // Dates are the one place this panel reshapes what USCIS sent — it returns
  // calendar dates and real instants in different shapes, and each is read
  // accordingly. If USCIS ever corrects those shapes, our handling becomes the
  // thing that is wrong. That risk is stated here, once, rather than as a
  // tooltip on every date row: the rows that used to carry it were themselves
  // duplicates of dates stated above the fold, and a caveat nobody hovers is
  // not a caveat.
  // Stated once, used twice: on screen under the panel header, and at the top
  // of the printed record. A printed document outlives the session and travels
  // to people who never saw the panel, so the two must not drift.
  var STANDING_DISCLAIMER =
    'Unofficial tool. Not USCIS, not legal advice. Dates and labels here are read out of ' +
    'USCIS data by this panel and can be wrong. my.uscis.gov and your mailed notices are the ' +
    'authority on your case — if this panel disagrees with them, believe them.';

  function buildStandingDisclaimer() {
    return el('div', {
      'class': 'uscistr-standing',
      title: DATE_CAVEAT,
      text: STANDING_DISCLAIMER
    });
  }

  function buildFooter() {
    // Export only — import was removed in 1.18.0. The export is a person's
    // record, not tool state: a new install reads the account page fresh, and
    // deleting the import path deleted the tool's largest untrusted-input
    // surface (a hostile backup file was a named threat in SECURITY.md).
    var exportBtn = el('button', {
      'class': 'uscistr-btn uscistr-btn-sm', type: 'button', text: 'Export', onclick: exportRecord
    });

    var left = el('div', { 'class': 'uscistr-footer-left' }, [
      // The persistent line is the authority statement, not the privacy one.
      // This panel reads an undocumented API and normalises some of its
      // quirks — notably dates, which USCIS sends in more than one shape. If
      // USCIS changes those shapes, our handling could be the thing that is
      // wrong. Whoever is reading this needs to know, at all times and without
      // scrolling, which source wins. The privacy claim is in the tooltip and
      // stated at length in the README.
      el('span', {
        'class': 'uscistr-truncate',
        title: 'CaseLens is unofficial and reads an undocumented USCIS API. Dates and ' +
          'labels are interpreted from that data and can be wrong. Your mailed notices ' +
          'and my.uscis.gov are authoritative. Everything this panel stores stays in ' +
          'this browser; it talks only to my.uscis.gov.',
        // Short enough not to truncate at 400px. The full sentence sits
        // directly above in the standing disclaimer, so an ellipsis here
        // rendered a clipped legal line beside its own complete twin — which
        // reads as a layout fault rather than as a caveat.
        text: 'Unofficial · follow your USCIS notices'
      })
    ]);
    // Print sits beside Export because they are the same act — getting a
    // record out — in two shapes: a file for keeping, a document for reading.
    var printBtn = el('button', {
      'class': 'uscistr-btn uscistr-btn-sm uscistr-btn-outline', type: 'button', text: 'Print…',
      disabled: !state.cases.length,
      onclick: function () { uiState.printFor = 'all'; render(); }
    });

    var right = el('div', { 'class': 'uscistr-footer-right' }, [
      printBtn,
      exportBtn,
      el('span', { 'class': 'uscistr-footer-sep', text: '|' }),
      el('span', { 'class': 'uscistr-version', text: 'v' + VERSION })
    ]);
    return el('div', { 'class': 'uscistr-footer' }, [left, right, buildPrintChoice()]);
  }

  // ---- settings popover -----------------------------------------------------

  function switchRow(labelText, description, checked, onToggle) {
    var toggle = el('button', {
      'class': 'uscistr-switch',
      type: 'button',
      role: 'switch',
      'aria-checked': checked ? 'true' : 'false',
      'aria-label': labelText,
      onclick: onToggle
    });
    var text = el('div', {}, [
      el('div', { 'class': 'uscistr-popover-label', text: labelText }),
      description ? el('div', { 'class': 'uscistr-popover-desc', text: description }) : null
    ]);
    return el('div', { 'class': 'uscistr-popover-row' }, [text, toggle]);
  }

  function buildSettingsPopover() {
    var currentMins = Math.round(state.prefs.refreshMs / 60000);
    var options = [5, 15, 30, 60];
    var refreshSelect = el('select', {
      'class': 'uscistr-select',
      'aria-label': 'Refresh interval',
      onchange: function (e) {
        var mins = parseInt(e.target.value, 10);
        state.prefs.refreshMs = mins * 60 * 1000;
        persistPrefs();
        restartRefreshTimer();
        render();
      }
    });
    for (var i = 0; i < options.length; i++) {
      refreshSelect.appendChild(el('option', {
        value: String(options[i]), text: options[i] + ' minutes', selected: options[i] === currentMins
      }));
    }

    var intervalRow = el('div', { 'class': 'uscistr-popover-row' }, [
      el('div', {}, [
        el('div', { 'class': 'uscistr-popover-label', text: 'Check every' }),
        el('div', { 'class': 'uscistr-popover-desc', text: 'Only while this tab is visible.' })
      ]),
      refreshSelect
    ]);

    var notifyRow = switchRow(
      'Desktop notifications',
      'Status, document and office changes only. Never behind-the-scenes record updates.',
      !!state.prefs.notify,
      function () {
        var next = !state.prefs.notify;
        if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') {
          Notification.requestPermission();
        }
        state.prefs.notify = next;
        persistPrefs();
        render();
      }
    );

    var darkRow = switchRow('Dark mode', null, !!state.prefs.dark, function () {
      state.prefs.dark = !state.prefs.dark;
      persistPrefs();
      render();
    });

    var redactRow = switchRow(
      'Hide receipt numbers',
      'Masks the middle of every receipt number, for screen sharing.',
      !!state.prefs.redact,
      function () {
        state.prefs.redact = !state.prefs.redact;
        persistPrefs();
        render();
      }
    );

    // Recovery for a panel dragged somewhere unreachable. The clamp keeps this
    // from happening, but a stored position from an older version can predate
    // the clamp, and there is otherwise no way back except clearing storage.
    var positionRow = el('div', { 'class': 'uscistr-popover-row' }, [
      el('div', {}, [
        el('div', { 'class': 'uscistr-popover-label', text: 'Panel position' }),
        el('div', { 'class': 'uscistr-popover-desc', text: 'Move it back to the bottom-right corner.' })
      ]),
      el('button', {
        'class': 'uscistr-btn uscistr-btn-sm uscistr-btn-outline', type: 'button', text: 'Reset',
        disabled: state.prefs.panelPos ? null : 'disabled',
        onclick: function () { resetPanelPosition(); }
      })
    ]);

    // The whole promise of this tool is that your data stays in your browser.
    // A promise like that is not complete without a way to take it back, and
    // "clear your browser storage" is not an answer anyone should have to
    // follow. This names exactly what is stored, so the claim is checkable.
    var eraseRow = el('div', { 'class': 'uscistr-popover-row' }, [
      el('div', {}, [
        el('div', { 'class': 'uscistr-popover-label', text: 'Erase everything' }),
        el('div', { 'class': 'uscistr-popover-desc',
          text: 'Deletes your saved cases, snapshots, history, settings and removals from this browser.' })
      ]),
      el('button', {
        'class': 'uscistr-btn uscistr-btn-sm uscistr-btn-outline', type: 'button', text: 'Erase',
        onclick: function () { eraseEverything(); }
      })
    ]);

    return el('div', { 'class': 'uscistr-popover', role: 'group', 'aria-label': 'Settings' }, [
      el('div', { 'class': 'uscistr-popover-head', text: 'Settings' }),
      intervalRow,
      el('div', { 'class': 'uscistr-popover-sep' }),
      notifyRow,
      darkRow,
      redactRow,
      el('div', { 'class': 'uscistr-popover-sep' }),
      positionRow,
      eraseRow
    ]);
  }

  function eraseEverything() {
    var ok = confirm(
      'Erase all CaseLens data from this browser?\n\n' +
      'This deletes your saved cases, every stored snapshot, your recorded ' +
      'history of changes, your settings, and the record of cases you removed.\n\n' +
      'Nothing at USCIS is touched — your cases are unaffected. Cases on your ' +
      'account will be found again the next time you open this page.\n\n' +
      'This cannot be undone. Export a backup first if you want to keep it.');
    if (!ok) return;

    var keys = [
      STORAGE_KEYS.cases, STORAGE_KEYS.snapshots, STORAGE_KEYS.history,
      STORAGE_KEYS.prefs, STORAGE_KEYS.dismissed, STORAGE_KEYS.codeText
    ];
    for (var i = 0; i < keys.length; i++) {
      try { localStorage.removeItem(keys[i]); } catch (e) { /* nothing to undo */ }
    }
    // Rescue copies written when a stored value could not be parsed. These are
    // never read back, so forgetting them elsewhere leaves case data behind in
    // a key nothing will ever clean up.
    try {
      var stale = [];
      for (var k = 0; k < localStorage.length; k++) {
        var name = localStorage.key(k);
        if (name && name.indexOf('uscisTracker.') === 0) stale.push(name);
      }
      for (var s = 0; s < stale.length; s++) localStorage.removeItem(stale[s]);
    } catch (e) { /* private mode: nothing was stored to begin with */ }

    location.reload();
  }

  // ---- case view: one case's data, assembled for rendering ------------------
  //
  // The boundary between "what USCIS said" and "what gets drawn". Everything
  // below builds or shapes a case's data; nothing here touches the DOM.
  // buildCaseView() is the single entry point the UI calls.
  //
  // These functions used to sit under the "settings popover" divider, which
  // covered them for ~700 lines. In a file whose whole claim is that a stranger
  // can audit it, a navigation comment that misdescribes what follows is worse
  // than no comment at all.

  // ==========================================================================
  // Timeline: collect -> dedupe -> sort -> decorate  (docs/design/03 §3)
  // ==========================================================================

  // Everything USCIS gave us for this case, plus what this tool observed,
  // normalized to one shape:
  //   { id, provenance, kind, sortAt, displayAt, precision, code, label, ... }
  // sortAt is what we order by; displayAt + precision is all the renderer is
  // allowed to print. A day-precision entry never gets a printed time.
  // Everything that goes on the timeline, from five independent sources.
  //
  // Each source appends to one list and none reads another's output, except
  // where noted: the current-status row and the synthesized backend row both
  // check what is already there to avoid printing the same event twice.
  //
  // Split out of one 200-line function. The seams were already marked by
  // comments; naming them means each source can be read, tested and changed
  // without holding the other four in mind.
  function collectTimelineItems(entry) {
    var result = entry.result;
    if (!result) return [];

    var detail = summarizeCaseDetail(result.caseDetail);
    var notice = summarizeCaseStatus(result.caseStatus);

    var items = uscisEventItems(result);
    appendCurrentStatusItem(items, notice);
    appendLocalChangeItems(items, getHistory(entry.number));
    appendBackendActivityItem(items, detail, notice);
    appendFiledAnchor(items, detail);
    appendUscisDocumentItems(items, summarizeDocuments(result.documents));
    return items;
  }

  // Document types whose presence is stage evidence. Exact-match against a
  // reviewed list, the same discipline as event codes: an unrecognised type
  // still renders verbatim in the timeline, it just moves no stage.
  var DOCUMENT_TYPE_STAGES = {
    'Appointment Scheduled': 'appointment'
  };

  // Source 6 — documents USCIS itself generated. `sourceType` cleanly
  // separates "USCIS Generated" from "Applicant Provided" (verified live
  // 2026-08-12), and the `type` field carries USCIS's own wording for what
  // the document is — "I-765 C09 Standalone Approval", "Appointment
  // Scheduled" — which for some milestones is stronger evidence than any
  // event code: SA, the code approvals ride on, is absent from the published
  // schema entirely, while the document names the outcome outright. The
  // user's own uploads stay in the documents section where they belong.
  function appendUscisDocumentItems(items, docs) {
    if (!docs) return;
    for (var i = 0; i < docs.length; i++) {
      var doc = docs[i];
      if (String(doc.source || '') !== 'USCIS Generated') continue;
      var typeText = flattenValue(doc.type);
      if (!typeText) continue;
      // "Other" is a bucket, not wording: a row reading "Other" says nothing
      // the documents section doesn't. Observed USCIS-generated documents
      // always carry a specific type; this guards against the generic one.
      if (String(typeText) === 'Other') continue;
      var atMs = doc.date ? parseUscisDate(doc.date) : null;
      items.push({
        id: 'doc:' + i,
        provenance: 'document',
        kind: 'document',
        sortAt: atMs === null ? null : endOfLocalDay(atMs),
        displayAt: atMs,
        precision: 'day',
        code: null,
        label: String(typeText),
        fileName: doc.name ? String(doc.name) : null,
        docStageType: DOCUMENT_TYPE_STAGES[String(typeText)] || null
      });
    }
  }

  // Source 1 — what USCIS sent: its own status history, its coded events, and
  // its notices (an appointment is a notice carrying a date).
  function uscisEventItems(result) {
    var items = [];
    var uscisEvents = extractUscisEvents(result);
    for (var i = 0; i < uscisEvents.length; i++) {
      var ev = uscisEvents[i];
      if (ev.source === 'status') {
        // historicalCaseStatuses carries a date and USCIS's own wording. It is
        // day precision: sortAt goes to end-of-day so the human sentence leads
        // the machine events it produced.
        items.push({
          id: 'hist:' + i,
          provenance: 'official',
          kind: 'status',
          sortAt: ev.at === null ? null : endOfLocalDay(ev.at),
          displayAt: ev.at,
          precision: 'day',
          code: ev.code === null || ev.code === undefined ? null : String(ev.code),
          label: ev.text || null,
          labelEs: ev.textSpanish || null
        });
      } else if (ev.source === 'event') {
        items.push({
          id: 'evt:' + i,
          provenance: 'coded',
          kind: 'event',
          sortAt: ev.at,
          displayAt: ev.at,
          precision: 'second',
          code: ev.code === null || ev.code === undefined ? null : String(ev.code),
          labelSource: codeLabelSource(ev.textSource),
          label: ev.text || null
        });
      } else if (ev.source === 'notice') {
        var apptMs = ev.appointmentAt ? parseUscisDate(ev.appointmentAt) : null;
        items.push({
          id: 'notice:' + i,
          provenance: 'notice',
          kind: apptMs !== null ? 'appointment' : 'notice',
          sortAt: apptMs !== null ? apptMs : ev.at,
          displayAt: apptMs !== null ? apptMs : ev.at,
          // Whether a time was actually sent, not an assumption that one was.
          // This was hardcoded 'second', so an appointment arriving date-only
          // would have printed "12:00 AM EDT" as a real appointment time — a
          // fabricated number on the one value where acting on the wrong one
          // means missing a biometrics appointment.
          precision: hasTimeComponent(ev.appointmentAt) ? 'second' : 'day',
          code: null,
          label: ev.text || 'Notice on file',
          generatedAt: ev.at,
          // Carried on the event by extractUscisEvents rather than looked up by
          // a parallel index into the raw notices. That alignment held only as
          // long as neither loop ever skipped an entry, and nothing enforced
          // it — a wrong letterId prints the wrong number on a notice.
          letterId: ev.letterId === undefined ? null : ev.letterId
        });
      }
    }
    return items;
  }

  // Where a coded row's words came from, which decides how the row labels
  // itself (SPEC "Event codes"):
  //   'learned'        USCIS's own wording, published for THIS case
  //   'niem'           the federal schema's description — official, but an
  //                    internal-operations phrase, not this case's status
  //   'other-case'     USCIS's wording for this code on another of the user's
  //                    cases on the same form
  //   'unknown-source' the dictionary did not load, so whether a meaning exists
  //                    is unknown; never assert there is none
  //   'none'           nobody publishes a meaning. Say exactly that.
  function codeLabelSource(textSource) {
    if (textSource === 'uscis') return 'learned';
    if (textSource === 'niem') return 'niem';
    if (textSource === 'uscis-other') return 'other-case';
    if (textSource === 'unavailable') return 'unknown-source';
    return 'none';
  }

  // Source 2 — the current status, when the history array does not already
  // carry it. Sparse cases have an empty history and would otherwise have no
  // row for the status the card is headlining.
  function appendCurrentStatusItem(items, notice) {
    if (!notice || !notice.status || !notice.actionCodeDate) return;
    var currentMs = parseUscisDate(notice.actionCodeDate);
    if (currentMs === null) return;

    for (var i = 0; i < items.length; i++) {
      if (items[i].provenance === 'official' &&
          String(items[i].code) === String(notice.actionCode) &&
          sameLocalDay(items[i].displayAt, currentMs)) {
        return;   // already on the timeline
      }
    }

    items.push({
      id: 'current',
      provenance: 'official',
      kind: 'status',
      sortAt: currentMs,
      displayAt: currentMs,
      precision: 'second',
      code: notice.actionCode === null || notice.actionCode === undefined
        ? null : String(notice.actionCode),
      label: notice.status,
      labelEs: notice.statusSpanish,
      body: notice.statusDetail,
      bodyEs: notice.statusDetailSpanish
    });
  }

  // Source 3 — changes this panel detected between checks. These are the only
  // rows whose timestamp is this tool's rather than USCIS's, and they say so in
  // every rendering.
  function appendLocalChangeItems(items, history) {
    for (var i = 0; i < history.length; i++) {
      var change = history[i];
      if (!change) continue;
      var noticedAt = parseUscisDate(change.at);

      if (change.kind === 'backend') {
        // The value that moved is a USCIS timestamp; prefer it over the
        // detection time, which only records when a browser tab was open.
        var movedTo = parseUscisDate(change.to);
        items.push({
          id: 'local:' + i,
          provenance: 'local',
          kind: 'backend',
          sortAt: movedTo !== null ? movedTo : noticedAt,
          displayAt: movedTo !== null ? movedTo : noticedAt,
          precision: 'second',
          code: null,
          label: 'USCIS touched your record',
          noticedAt: noticedAt
        });
        continue;
      }

      items.push({
        id: 'local:' + i,
        provenance: 'local',
        kind: change.kind || 'change',
        sortAt: noticedAt,
        displayAt: noticedAt,
        precision: 'second',
        code: null,
        label: describeChange(change),
        from: change.from,
        to: change.to,
        noticedAt: noticedAt
      });
    }
  }

  // Source 4 — backend activity visible in this fetch: the record moved while
  // the public status did not. Gated at three days; below that it is plausibly
  // the same action written twice, and a shrug rendered as a signal is noise.
  function appendBackendActivityItem(items, detail, notice) {
    if (!detail || !detail.backendAt || !notice || !notice.actionCodeDate) return;
    var backendMs = parseUscisDate(detail.backendAt);
    var statusMs = parseUscisDate(notice.actionCodeDate);
    if (backendMs === null || statusMs === null) return;
    if (backendMs - statusMs <= BACKEND_MIN_LAG_MS) return;

    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'backend' && items[i].displayAt !== null &&
          Math.abs(items[i].displayAt - backendMs) < 1000) {
        return;   // already recorded from history
      }
    }

    items.push({
      id: 'backend:' + backendMs,
      provenance: 'local',
      kind: 'backend',
      sortAt: backendMs,
      displayAt: backendMs,
      precision: 'second',
      code: null,
      label: 'USCIS touched your record',
      lagDays: daysBetween(statusMs, backendMs),
      statusAt: statusMs
    });
  }

  // Source 5 — the filed anchor. Day 0, and never folded away.
  function appendFiledAnchor(items, detail) {
    if (!detail || !detail.submissionDate) return;
    var filedMs = parseUscisDate(detail.submissionDate);
    if (filedMs === null) return;

    items.push({
      id: 'filed',
      provenance: 'anchor',
      kind: 'filed',
      sortAt: startOfLocalDay(filedMs),
      displayAt: filedMs,
      precision: 'day',
      code: null,
      label: 'Filed',
      formType: detail.formType ? String(detail.formType) : null
    });
  }

  // Passes 1-4 of §3: official x coded on equal codes, local rows absorbed by
  // the official row that says the same thing, and API-duplicated events.
  // Decorates the items it is given (removed, corroborated, loggedAt,
  // firstSeenLocally, and sortAt) and returns the survivors. Named for that:
  // it reads like a filter and is not one, and now that buildCaseView is
  // memoized these mutations persist for the whole render rather than being
  // rebuilt each call.
  function decorateAndDedupeTimeline(items, docNames) {
    var i, j;

    // Pass 1 — an official day-precision row and a coded row carrying the same
    // code within 36h are the same event seen twice. The official row wins on
    // text and adopts the coded row's precise sort key, but keeps DAY display
    // precision: USCIS only ever told us the date.
    for (i = 0; i < items.length; i++) {
      var official = items[i];
      if (official.provenance !== 'official' || !official.code || official.sortAt === null) continue;
      var best = null;
      var bestDelta = 0;
      for (j = 0; j < items.length; j++) {
        var coded = items[j];
        if (coded.provenance !== 'coded' || coded.removed || coded.sortAt === null) continue;
        if (String(coded.code) !== String(official.code)) continue;
        var delta = Math.abs(coded.sortAt - official.sortAt);
        if (delta > DEDUPE_WINDOW_MS) continue;
        if (best === null || delta < bestDelta) { best = coded; bestDelta = delta; }
      }
      if (best) {
        official.corroborated = true;
        official.loggedAt = best.displayAt;
        // Adopt the precise time only when it falls inside the day being
        // displayed. USCIS logs the coded event as a real instant and the
        // official row as a bare date, and those can straddle midnight in the
        // reader's zone: an event shown as "Jul 10" would then sort at Jul 9
        // 18:00 and appear BELOW a genuine Jul 9 row in a newest-first list —
        // two rows visibly out of date order.
        if (sameLocalDay(best.sortAt, official.sortAt)) official.sortAt = best.sortAt;
        best.removed = true;
      }
    }

    // Pass 2 — a local "status changed to X" row and an official row saying X
    // are the same event. Printing both, with two different dates, is the most
    // confusing failure mode of a naive merge; instead the official row gains
    // "You first saw this on ...".
    for (i = 0; i < items.length; i++) {
      var local = items[i];
      if (local.provenance !== 'local' || local.kind !== 'status' || local.removed) continue;
      // The NEAREST preceding official row, not the first one in array order.
      // USCIS's history arrives oldest-first, and a status title recurs on a
      // real case — "USCIS Is Currently Processing Your Case" comes back after
      // an evidence response. Taking the first match therefore attached "You
      // first saw this on August 3, 2026" to an event dated February 2025, and
      // the row that actually earned the marker lost it.
      var bestMatch = null;
      for (j = 0; j < items.length; j++) {
        var match = items[j];
        if (match.provenance !== 'official' || match.removed) continue;
        if (normalizeText(match.label) !== normalizeText(local.to)) continue;
        if (match.sortAt === null || local.sortAt === null || match.sortAt > local.sortAt) continue;
        if (bestMatch === null || match.sortAt > bestMatch.sortAt) bestMatch = match;
      }
      if (bestMatch) {
        bestMatch.firstSeenLocally = local.displayAt;
        local.removed = true;
      }
    }

    // Pass 3 — a local "new document" row is redundant when the documents
    // section already lists that file with USCIS's own date.
    for (i = 0; i < items.length; i++) {
      var localDoc = items[i];
      if (localDoc.provenance !== 'local' || localDoc.kind !== 'document' || localDoc.removed) continue;
      if (docNames && docNames[String(localDoc.to)]) localDoc.removed = true;
    }

    // Pass 4 — identical coded events (same code, same second) the API
    // sometimes returns twice.
    var seenCoded = {};
    for (i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.provenance !== 'coded' || item.removed || item.sortAt === null) continue;
      var key = item.code + '|' + Math.floor(item.sortAt / 1000);
      if (seenCoded[key]) { item.removed = true; continue; }
      seenCoded[key] = true;
    }

    // Pass 5 — an "Appointment Scheduled" document and the appointment notice
    // are one letter seen through two endpoints: the PDF on file, and the
    // notice record carrying the appointment date. The notice row wins — it
    // has the date that matters — when its generation date sits within the
    // dedupe window of the document's creation date.
    for (i = 0; i < items.length; i++) {
      var docItem = items[i];
      if (docItem.provenance !== 'document' || docItem.removed) continue;
      if (!docItem.docStageType || docItem.displayAt === null) continue;
      for (j = 0; j < items.length; j++) {
        var noticeItem = items[j];
        if (noticeItem.provenance !== 'notice' || noticeItem.removed) continue;
        if (noticeItem.kind !== 'appointment') continue;
        // generatedAt is already parsed ms (extractUscisEvents parses dates
        // once, at the boundary).
        var genAt = typeof noticeItem.generatedAt === 'number' ? noticeItem.generatedAt : null;
        if (genAt === null) continue;
        if (Math.abs(genAt - docItem.displayAt) <= DEDUPE_WINDOW_MS) {
          docItem.removed = true;
          break;
        }
      }
    }

    var kept = [];
    for (i = 0; i < items.length; i++) {
      if (!items[i].removed) kept.push(items[i]);
    }
    return kept;
  }

  function precisionRank(item) {
    return item.precision === 'day' ? 0 : 1;
  }

  // Newest first. Ties break by trust, then by precision, then by id — the
  // last one exists so the list never reshuffles between renders, which
  // matters because a timeline that moves on refresh destroys exactly the
  // confidence this panel is trying to build.
  function sortTimelineItems(items) {
    var dated = [];
    var undated = [];
    var i;
    for (i = 0; i < items.length; i++) {
      if (items[i].sortAt === null || items[i].sortAt === undefined) undated.push(items[i]);
      else dated.push(items[i]);
    }
    dated.sort(function (a, b) {
      if (b.sortAt !== a.sortAt) return b.sortAt - a.sortAt;
      var rank = (PROV_RANK[a.provenance] || 9) - (PROV_RANK[b.provenance] || 9);
      if (rank !== 0) return rank;
      var prec = precisionRank(a) - precisionRank(b);
      if (prec !== 0) return prec;
      return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0);
    });

    // The filed anchor is the origin of the record and always renders last,
    // even when something else shares its calendar day. Anchors are collected
    // as a list, not a scalar: real data has exactly one, but a malformed
    // input with two must not silently DROP one — found by fuzzing, and
    // "never drop data from the timeline" is not conditional on the input
    // being well-formed.
    var ordered = [];
    var filed = [];
    for (i = 0; i < dated.length; i++) {
      if (dated[i].kind === 'filed') filed.push(dated[i]);
      else ordered.push(dated[i]);
    }
    ordered = ordered.concat(undated);
    for (i = 0; i < filed.length; i++) ordered.push(filed[i]);
    return ordered;
  }

  // Three or more consecutive backend rows collapse into one. Without this a
  // case that gets touched weekly buries its real events.
  function collapseBackendRuns(items) {
    var out = [];
    var i = 0;
    while (i < items.length) {
      if (items[i].kind !== 'backend') { out.push(items[i]); i++; continue; }
      var j = i;
      while (j < items.length && items[j].kind === 'backend') j++;
      var run = items.slice(i, j);
      if (run.length >= 3) {
        out.push({
          id: run[0].id + '+run',
          provenance: 'local',
          kind: 'backend',
          sortAt: run[0].sortAt,
          displayAt: run[0].displayAt,
          precision: 'second',
          code: null,
          label: 'USCIS touched your record ' + run.length + ' times',
          runCount: run.length,
          runFrom: run[run.length - 1].displayAt,
          runTo: run[0].displayAt
        });
      } else {
        out = out.concat(run);
      }
      i = j;
    }
    return out;
  }

  // Two rules depend on this being one decision rather than several. Copy that
  // asserts absence ("USCIS hasn't published a status yet") is never reachable
  // from a check that failed — a failed fetch knows nothing about what USCIS
  // has published. And a card is never emptied while a snapshot exists: a 2am
  // session timeout must not be indistinguishable from "my cases are gone".
  //
  // Where this card's content is coming from — the only question any caller
  // actually asks. It used to return six values, of which four ('loading',
  // 'fresh', 'blank', 'empty') were computed on every render and never
  // compared anywhere: a state machine that looked like it governed the card
  // and governed nothing, which is worse than no state machine at all.
  //
  //   'unchecked' — not fetched yet this session; a stored snapshot may stand in
  //   'stale'     — this fetch told us nothing usable; fall back to the snapshot
  //   null        — this fetch's own data, the ordinary path
  function caseContentSource(entry, view) {
    if (!entry.result) return 'unchecked';
    if (view.hasData) return null;
    return snapshotHasContent(view.lastKnown) ? 'stale' : null;
  }

  // Everything the card needs, computed once per render — now actually once.
  //
  // The sort, the rail and the card each called this, so it ran about twice per
  // case per render, re-reading storage and rebuilding the whole timeline every
  // time. At one to four cases that is invisible; at the 25-case ceiling with
  // long histories it is a few hundred milliseconds of jank on every click.
  //
  // It matters more for correctness than for speed: collectTimelineItems and
  // dedupe decorate the items they return, so "compute it twice and throw one
  // away" was quietly load-bearing. Memoizing makes the single-computation
  // claim true and removes that trap.
  var caseViewMemo = Object.create(null);

  function invalidateCaseViews() { caseViewMemo = Object.create(null); }

  function buildCaseView(entry) {
    var key = String(entry.number).toUpperCase();
    if (caseViewMemo[key]) return caseViewMemo[key];
    var built = computeCaseView(entry);
    caseViewMemo[key] = built;
    return built;
  }

  function computeCaseView(entry) {
    var result = entry.result;
    var view = {
      detail: null, notice: null, docs: null, processing: null,
      items: [], upcoming: [], office: null, officeCode: null,
      evidenceCount: 0, hasData: false,
      // fromCache: this card is drawn from a stored snapshot because the
      // latest fetch failed. cachedAt is when that snapshot was taken.
      fromCache: false, cachedAt: null,
      lastKnown: getSnapshot(entry.number), source: null,

      // Facts about THIS check that the renderers need. They are derived here,
      // once, rather than by each render function reaching back into
      // entry.result — which is how "did the documents endpoint fail?" ended up
      // being asked three different ways in three places, one of them wrong.
      //
      //   sourcesUnread   — neither core endpoint could be read
      //   docsUnread      — the documents endpoint specifically failed
      //   estimateUnread  — the processing-time endpoint failed
      //   estimateMonths  — months USCIS published, or null if none/unreadable
      //   checkedAt       — when this case was last read SUCCESSFULLY
      //   history         — this panel's own recorded changes for the case
      sourcesUnread: false, docsUnread: false, estimateUnread: false,
      estimateMonths: null, checkedAt: null,
      history: getHistory(entry.number)
    };
    if (!result) {
      view.source = caseContentSource(entry, view);
      // Not fetched yet this session, but a previous session left a snapshot —
      // show it rather than an empty shell while the refresh runs.
      if (view.source === 'unchecked' && snapshotHasContent(view.lastKnown)) {
        applyCachedSnapshot(view);
      }
      return view;
    }

    view.detail = summarizeCaseDetail(result.caseDetail);
    view.notice = summarizeCaseStatus(result.caseStatus);
    view.docs = summarizeDocuments(result.documents);
    view.processing = summarizeProcessingTimes(result.processingTimes);
    view.hasData = !!(view.detail || view.notice || view.docs);

    // Derived once, here, so no renderer has to ask entry.result anything.
    view.sourcesUnread = payloadFailed(result.caseDetail) || payloadFailed(result.caseStatus);
    view.docsUnread = !payloadUsable(result.documents);
    view.estimateUnread = payloadFailed(result.processingTimes);
    view.checkedAt = result.succeededAt || null;
    view.estimateMonths = view.processing ? parseEstimateMonths(result.processingTimes) : null;

    view.office = view.notice && view.notice.office ? view.notice.office : null;
    if (!view.office) {
      var location = summarizeLocation(result.location);
      if (location && location.office) view.office = location.office;
    }
    if (payloadUsable(result.caseStatus)) {
      var code = pick(result.caseStatus, FIELDS.caseStatus.officeCode);
      view.officeCode = code === null ? null : String(code);
    }
    if (payloadUsable(result.caseDetail)) {
      var requests = pick(result.caseDetail, FIELDS.caseDetail.evidenceRequests);
      if (Array.isArray(requests)) view.evidenceCount = requests.length;
    }

    var docNames = Object.create(null);
    if (view.docs) {
      for (var d = 0; d < view.docs.length; d++) {
        if (view.docs[d].name) docNames[String(view.docs[d].name)] = true;
      }
    }

    var items = decorateAndDedupeTimeline(collectTimelineItems(entry), docNames);
    items = sortTimelineItems(items);

    // A scheduled appointment is the only forward-looking thing we can
    // honestly show. It leaves the history rail until its date passes.
    var now = new Date().getTime();
    var history = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].kind === 'appointment' && items[i].sortAt !== null && items[i].sortAt > now) {
        view.upcoming.push(items[i]);
      } else {
        history.push(items[i]);
      }
    }
    view.items = collapseBackendRuns(history);
    view.source = caseContentSource(entry, view);
    if (view.source === 'stale') applyCachedSnapshot(view);
    return view;
  }

  // This fetch told us nothing, but we have a stored snapshot from one that
  // did. Render that instead of emptying the card: a person who opens the
  // panel after a session timeout came to see their case, and blanking it is
  // indistinguishable from the case having disappeared. Everything filled in
  // here was observed on a real earlier read; the card marks itself stale and
  // dates it, so nothing is presented as current.
  function applyCachedSnapshot(view) {
    var snap = view.lastKnown;
    if (!snap) return;

    view.fromCache = true;
    view.cachedAt = snap.at || null;

    if (!view.detail) {
      view.detail = {
        receiptNumber: null,
        formType: snap.formType || null,
        formName: snap.formName || null,
        submissionDate: snap.submissionDate || null,
        backendAt: snap.backendAt || null,
        // Whatever USCIS actually said on the last successful read, or null if
        // they never said. This used to be hardcoded null on the grounds that a
        // cached card should claim nothing — but that silently deleted a
        // scheduled appointment and an open evidence request from the collapsed
        // row whenever a single request dropped, which is worse than showing a
        // dated fact. The card marks itself stale and names the date.
        closed: strictBool(snap.closed),
        actionRequired: strictBool(snap.actionRequired),
        premium: null,
        representativeName: null
      };
    }

    if (!view.evidenceCount && snap.evidenceCount) view.evidenceCount = snap.evidenceCount;
    if (!view.upcoming.length && snap.appointments && snap.appointments.length) {
      var now = new Date().getTime();
      for (var a = 0; a < snap.appointments.length; a++) {
        // A cached appointment whose date has since passed is dropped rather
        // than shown: we cannot know whether it was attended or rescheduled.
        if (snap.appointments[a].at <= now) continue;
        view.upcoming.push({
          kind: 'appointment',
          label: snap.appointments[a].label,
          displayAt: snap.appointments[a].at,
          sortAt: snap.appointments[a].at,
          fromCache: true
        });
      }
    }

    if (!view.notice) {
      view.notice = {
        receiptNumber: null,
        formNumber: snap.formType || null,
        status: snap.status || null,
        statusDetail: null,
        statusSpanish: null,
        statusDetailSpanish: null,
        actionCode: snap.actionCode || null,
        actionCodeDate: snap.statusAt || null,
        office: snap.office || null,
        historyCount: 0
      };
    }

    if (!view.office && snap.office) view.office = snap.office;
  }

  // ---- timeline rendering ---------------------------------------------------

  // Node shape is the primary provenance channel and is legible at 12px;
  // colour is reinforcement only.
  function timelineGlyph(item) {
    if (item.attention) return { icon: 'alert', tone: 'attention' };
    if (item.provenance === 'official') {
      return { icon: item.corroborated ? 'discRing' : 'disc', tone: 'official' };
    }
    if (item.provenance === 'notice') {
      return { icon: item.kind === 'appointment' ? 'calendar' : 'page', tone: 'official' };
    }
    if (item.provenance === 'coded') {
      return { icon: 'ring', tone: codeIsTheLabel(item) ? 'quiet' : 'coded' };
    }
    if (item.provenance === 'document') return { icon: 'page', tone: 'official' };
    if (item.kind === 'backend') return { icon: 'ringDashed', tone: 'quiet' };
    if (item.kind === 'filed') return { icon: 'cap', tone: 'quiet' };
    return { icon: 'diamond', tone: 'local' };
  }

  // Rows where the raw code is all we have to lead with, either because
  // nobody publishes a meaning or because we could not look one up. The two
  // are different claims and the disclosure keeps them apart, but they render
  // the same way: the code, and no wording around it.
  function codeIsTheLabel(item) {
    return item.provenance === 'coded' &&
      (item.labelSource === 'none' || item.labelSource === 'unknown-source');
  }

  // The label a row leads with. Untranslated codes render as the raw code —
  // "Case event FTA0" plus "we don't know what this means" is a better row
  // than a confident wrong one.
  function timelineLabel(item, spanish) {
    if (spanish && item.labelEs) return item.labelEs;
    if (item.label) return item.label;
    if (item.code) return 'Case event ' + item.code;
    return 'Case event';
  }

  function timelineMetaParts(item) {
    var parts = [];
    var dateText = item.displayAt === null ? '' : formatDayLabel(item.displayAt);

    if (item.provenance === 'official') {
      parts.push(dateText);
      parts.push('USCIS');
      // No "logged 9:58 PM". Minute precision on a case that moves monthly is
      // noise, and it invites reading a clerical timestamp as significant.
    } else if (item.provenance === 'coded') {
      parts.push(dateText);
      parts.push('USCIS event' + (item.code ? ' ' + item.code : ''));
    } else if (item.provenance === 'notice') {
      parts.push(item.kind === 'appointment'
        ? 'Notice generated ' + formatDayLabel(item.generatedAt)
        : dateText);
      parts.push(item.letterId ? 'USCIS notice ' + item.letterId : 'USCIS notice');
    } else if (item.provenance === 'document') {
      // The label IS USCIS's own `type` wording for the document, verbatim.
      parts.push(dateText);
      parts.push('USCIS document');
    } else if (item.kind === 'backend') {
      parts.push(item.runCount
        ? formatDayLabel(item.runFrom) + ' – ' + formatDayLabel(item.runTo)
        : dateText);
      parts.push('record updated, status unchanged');
    } else if (item.kind === 'filed') {
      parts.push(dateText);
      parts.push((item.formType ? item.formType + ' ' : '') + 'received by USCIS');
      parts.push('day 0');
    } else {
      // Locally observed. "Noticed" leads, so a reader scanning the meta
      // column sees the provenance before anything that looks like an
      // official timestamp.
      parts.push('Noticed ' + dateText + (item.displayAt === null ? '' : ', ' + formatTimeOfDay(item.displayAt)));
      parts.push('by this tool');
    }
    if (item.attention) parts.push('needs attention');
    return parts;
  }

  // The body behind a row: the full official prose, the exact timestamp, and a
  // plain-English sentence about where the words came from.
  function timelineBody(item, spanish, movesStage) {
    var lines = [];
    if (item.provenance === 'official') {
      var body = spanish && item.bodyEs ? item.bodyEs : item.body;
      if (body) lines.push(body);
      if (item.code) {
        lines.push('Action code ' + item.code + ' · reported by USCIS on ' + formatDateFull(item.displayAt) + '.');
      }
      if (item.corroborated && item.loggedAt) {
        lines.push('USCIS also logged this as a coded event at ' + formatTimeOfDay(item.loggedAt) + '.');
      }
      if (item.firstSeenLocally) {
        lines.push('You first saw this on ' + formatDateFull(item.firstSeenLocally) + '.');
      }
    } else if (item.provenance === 'coded') {
      if (item.labelSource === 'learned') {
        lines.push('USCIS logged code ' + item.code + ' on ' + formatDateFull(item.displayAt) +
          ' at ' + formatTimeOfDay(item.displayAt) + '. The wording above is USCIS’s own: it is the status text USCIS published for this code on one of your cases.');
      } else if (item.labelSource === 'niem') {
        lines.push('USCIS sent only the code ' + item.code + '. "' + item.label +
          '" is that code’s description in the federal data standard USCIS publishes (NIEM).');
        lines.push('That is an internal operations phrase describing what the system did — it is not the status USCIS writes for you about this case, and it can read very differently from the wording on my.uscis.gov.');
        lines.push('What is certain: USCIS logged an event coded ' + item.code + ' on ' + formatDateFull(item.displayAt) + '.');
      } else if (item.labelSource === 'other-case') {
        lines.push('USCIS sent only the code ' + item.code + '. "' + item.label +
          '" is the wording USCIS published for that code on a different case of yours on the same form — not on this one.');
        lines.push('It is shown because it is USCIS’s own language, and kept below the federal description because USCIS did not write it about this case.');
        lines.push('What is certain: USCIS logged an event coded ' + item.code + ' on ' + formatDateFull(item.displayAt) + '.');
      } else if (item.labelSource === 'unknown-source') {
        lines.push('USCIS logged an event coded ' + item.code + ' on ' + formatDateFull(item.displayAt) + '.');
        lines.push('The published code list did not load in this copy of the panel, so this code could not be looked up. That is a fault in this tool, not a gap in your record.');
      } else {
        lines.push('USCIS logged this code on your case, and no meaning for it is published — not in the status text USCIS wrote for this account, and not in the federal schema.');
        lines.push('USCIS does use codes outside the published standard, so this is a gap in public documentation rather than a problem with the case.');
        // Only claim it had no effect when it had no effect. Five of the codes
        // in our curated stage table — including SA, which marked a real case
        // approved — have no published meaning, so this sentence used to be
        // printed under codes that had just moved the rail, sometimes all the
        // way to Approved. The table is a deliberate curation (see SPEC, X-1);
        // what was wrong was denying it existed.
        lines.push(movesStage
          ? 'This panel does place this code on the stage map above, from its own curated list. That placement is an interpretation, not a published fact, and no source defines this code.'
          : 'It does not move this case forward or back on the stage map above: an unrecognised code does not vote.');
      }
    } else if (item.kind === 'backend') {
      if (item.runCount) {
        lines.push('USCIS modified its internal copy of this case ' + item.runCount + ' times between ' +
          formatDateFull(item.runFrom) + ' and ' + formatDateFull(item.runTo) + '. The public status did not change in that time.');
      } else {
        lines.push('USCIS’s internal copy of this case was modified on ' + formatDateFull(item.displayAt) +
          (item.lagDays ? ' — ' + plural(item.lagDays, 'day') + ' after the visible status was set' : '') + '.');
      }
      lines.push('The public status did not change. This sometimes comes before visible movement, and sometimes means nothing observable. It is shown here because my.uscis.gov does not show it.');
    } else if (item.provenance === 'notice') {
      lines.push('USCIS generated this notice on ' + formatDateFull(item.generatedAt) + '.');
      lines.push('Check the notice in your USCIS account for the address and what to bring.');
    } else if (item.provenance === 'local' && item.kind === 'status') {
      lines.push('Was: "' + (item.from === null || item.from === undefined ? 'not recorded' : item.from) + '".');
      lines.push('USCIS does not publish when this changed — ' + formatDateFull(item.displayAt) + ', ' +
        formatTimeOfDay(item.displayAt) + ' is when this tool first saw it.');
    } else if (item.provenance === 'local') {
      lines.push('This tool noticed this between two checks. USCIS did not publish a date for it.');
    }
    return lines;
  }

  function buildTimelineRow(entry, item, isLast, spanish, movesStage) {
    var glyph = timelineGlyph(item);
    var nodeCell = el('div', { 'class': 'uscistr-node uscistr-node-' + glyph.tone + (isLast ? ' uscistr-node-last' : '') });
    var icon = buildIcon(glyph.icon);
    if (icon) nodeCell.appendChild(icon);

    var borrowedLabel = item.provenance === 'coded' &&
      (item.labelSource === 'niem' || item.labelSource === 'other-case');

    var labelText = timelineLabel(item, spanish);
    var labelClass = 'uscistr-timeline-text';
    if (codeIsTheLabel(item)) labelClass += ' uscistr-is-quiet';
    if (item.attention) labelClass += ' uscistr-is-attention';
    // A dotted underline is the standard web affordance for "this word has a
    // caveat attached": it survives greyscale and costs no horizontal space.
    if (borrowedLabel) labelClass += ' uscistr-unofficial-label';

    var head = el('div', { 'class': 'uscistr-timeline-head' }, [
      el('span', { 'class': labelClass, text: labelText }),
      // The raw code is always visible next to a decoded label. When the code
      // IS the label there is no point printing it twice.
      (item.code && !codeIsTheLabel(item)) ? codeChip(item.code) : null
    ]);

    var metaParts = timelineMetaParts(item);
    var meta = el('div', { 'class': 'uscistr-timeline-meta' });
    for (var m = 0; m < metaParts.length; m++) {
      if (!metaParts[m]) continue;
      if (m > 0) meta.appendChild(metaSep());
      if (m === 0) meta.appendChild(el('span', { 'class': 'uscistr-timeline-date', text: metaParts[m] }));
      else meta.appendChild(el('span', { text: metaParts[m] }));
    }
    if (borrowedLabel) {
      meta.appendChild(metaSep());
      meta.appendChild(chip(item.labelSource === 'niem' ? 'system description' : 'from another case', 'quiet'));
    }

    var bodyLines = timelineBody(item, spanish, movesStage);
    var cell = el('div', { 'class': 'uscistr-timeline-cell' });
    var stack = el('div', { 'class': 'uscistr-timeline-body' }, [head, meta]);
    if (item.fileName) {
      stack.appendChild(el('div', { 'class': 'uscistr-timeline-sub', text: middleTruncate(item.fileName, 44), title: item.fileName }));
    }
    if (item.firstSeenLocally) {
      stack.appendChild(el('div', {
        'class': 'uscistr-timeline-note',
        text: 'You first saw this on ' + formatDayLabel(item.firstSeenLocally) + '.'
      }));
    }

    if (!bodyLines.length) {
      cell.appendChild(stack);
      return el('div', { 'class': 'uscistr-timeline-row' }, [nodeCell, cell]);
    }

    var expanded = !!(caseUi(entry).openRows && caseUi(entry).openRows[item.id]);
    var toggle = el('button', {
      'class': 'uscistr-row-toggle',
      type: 'button',
      'aria-expanded': expanded ? 'true' : 'false',
      title: borrowedLabel
        ? labelText + ' — not USCIS wording about this case'
        : labelText,
      onclick: function () {
        if (!caseUi(entry).openRows) caseUi(entry).openRows = {};
        caseUi(entry).openRows[item.id] = !caseUi(entry).openRows[item.id];
        render();
      }
    }, [stack]);
    cell.appendChild(toggle);

    if (expanded) {
      var disclosure = el('div', { 'class': 'uscistr-disclosure' });
      for (var b = 0; b < bodyLines.length; b++) {
        disclosure.appendChild(el('p', { text: bodyLines[b] }));
      }
      // Something concrete to take to a forum or a lawyer when we cannot help.
      // Clipboard only: nothing here is ever transmitted anywhere. It lives
      // inside the disclosure because a button on every unexplained row is a
      // column of buttons on exactly the cases with the least to say.
      if (item.provenance === 'coded' && item.labelSource === 'none') {
        disclosure.appendChild(codeCopyButton(entry, item));
      }
      linkDisclosure(toggle, disclosure);
      cell.appendChild(disclosure);
    }
    return el('div', { 'class': 'uscistr-timeline-row' }, [nodeCell, cell]);
  }

  // Everything we know about one unrecognised code, in a form that can be
  // pasted into a forum post or an email. Clipboard only — this tool never
  // sends a case number anywhere.
  function codeDetailsText(entry, item) {
    var detail = buildCaseView(entry).detail;
    var lines = [];
    lines.push('USCIS event code: ' + item.code);
    if (detail && detail.formType) lines.push('Form: ' + detail.formType);
    lines.push('Case: ' + displayNumber(entry.number));
    if (item.displayAt !== null && item.displayAt !== undefined) {
      lines.push('Logged: ' + formatDateFull(item.displayAt) + ' at ' + formatTimeOfDay(item.displayAt));
    }
    lines.push('No published meaning for this code: it is not in the status text USCIS wrote for this account, and not in the federal NIEM schema.');
    lines.push('via CaseLens (local, unofficial)');
    return lines.join('\n');
  }

  function codeCopyButton(entry, item) {
    return copyButton({
      label: 'Copy code details',
      'class': 'uscistr-btn uscistr-btn-sm uscistr-btn-ghost uscistr-code-copy',
      title: 'Copies this code and its date to the clipboard. Nothing is sent anywhere.',
      // Read at click time, not build time: the card may have been re-rendered
      // from newer data since this button was created.
      getText: function () { return codeDetailsText(entry, item); }
    });
  }

  function gapRow(days) {
    return el('div', { 'class': 'uscistr-gap' }, [
      el('div', { 'class': 'uscistr-node uscistr-node-quiet uscistr-node-through' }),
      el('div', { 'class': 'uscistr-gap-text', text: '— ' + plural(days, 'day') + ' —' })
    ]);
  }

  // Merged, newest first, folded to the most recent few plus the filed anchor.
  function buildTimeline(entry, view) {
    var wrap = el('div', { 'class': 'uscistr-timeline' });
    var items = view.items;
    var spanish = !!caseUi(entry).spanish;
    var i;

    // "We could not read it" and "USCIS has published nothing" are different
    // claims about the record, and they never get the same sentence.
    var sourcesUnread = view.sourcesUnread;

    if (!items.length) {
      wrap.appendChild(el('div', { 'class': 'uscistr-note', text: sourcesUnread
        ? 'This case’s history could not be read on this check, so this list is not the whole record.'
        : "USCIS hasn't published any history for this case — only its current status. This panel will record anything that changes from now on."
      }));
      return wrap;
    }

    var showAll = !!caseUi(entry).showAllEvents;
    var visible;
    if (showAll || items.length <= TIMELINE_FOLD + 1) {
      visible = items;
    } else {
      visible = items.slice(0, TIMELINE_FOLD);
      // The origin of the record is always on screen, so the fold never hides
      // where the case started. Mark the join: everything between these two
      // rows is hidden, so the gap across it is not a real quiet stretch.
      if (items[items.length - 1].kind === 'filed') {
        visible[visible.length - 1] = shallowCopy(visible[visible.length - 1]);
        visible[visible.length - 1].foldEdge = true;
        visible = visible.concat([items[items.length - 1]]);
      }
    }

    var onlyLocal = true;
    for (i = 0; i < items.length; i++) {
      if (items[i].provenance !== 'local') { onlyLocal = false; break; }
    }
    if (onlyLocal) {
      wrap.appendChild(el('div', { 'class': 'uscistr-note', text:
        'Nothing here came from USCIS yet. These entries are changes this panel noticed between checks.'
      }));
    }

    var unexplainedCodes = [];
    for (i = 0; i < items.length; i++) {
      if (items[i].labelSource === 'none' && items[i].code) unexplainedCodes.push(items[i].code);
    }

    for (i = 0; i < visible.length; i++) {
      var isLast = i === visible.length - 1;
      // Whether this row's code is stage activity — form-independent now, the
      // mapping lives with the code descriptions in core/uscis-codes.js.
      var movesStage = !!(visible[i].code && stageTypeOfCode(visible[i].code));
      wrap.appendChild(buildTimelineRow(entry, visible[i], isLast, spanish, movesStage));
      // Gap labels convert a list of dates into a visible rhythm, and make the
      // current silence comparable to past silences. Not next to a backend row
      // though: that row already carries its own lag in days, and the two
      // numbers side by side measure different things.
      //
      // Never across the fold either. The row above the filed anchor is
      // followed by every hidden event, so labelling that span "— 312 days —"
      // in the same visual language used for genuine silences asserts a quiet
      // stretch that did not happen.
      if (!isLast && !visible[i].foldEdge &&
          visible[i].displayAt !== null && visible[i + 1].displayAt !== null &&
          visible[i].kind !== 'backend' && visible[i + 1].kind !== 'backend') {
        var gap = daysBetween(visible[i + 1].displayAt, visible[i].displayAt);
        if (gap >= GAP_LABEL_MIN_DAYS) wrap.appendChild(gapRow(gap));
      }
    }

    // One footnote for the whole list rather than a sentence under every
    // unexplained row: the fact is about the public documentation, not about
    // any single event, and repeating it made the sparsest cases the loudest.
    if (unexplainedCodes.length) {
      wrap.appendChild(el('div', { 'class': 'uscistr-timeline-footnote', text:
        'No published meaning for ' + unexplainedCodes.join(', ') +
        '. USCIS uses codes outside the published standard, so this is a gap in public documentation. Each row says what is known about its code.' }));
    }

    // Naming the gap, rather than just the failure, lets a reader calibrate
    // how much of the list to trust.
    if (sourcesUnread) {
      var missing = payloadFailed(entry.result.caseDetail)
        ? 'Coded events and notices could not be loaded on this check'
        : 'The status history could not be loaded on this check';
      wrap.appendChild(el('div', { 'class': 'uscistr-note', text: missing +
        ', so this timeline may be missing entries. Everything shown is still real.' }));
    }

    if (!showAll && visible.length < items.length) {
      wrap.appendChild(el('button', {
        'class': 'uscistr-btn uscistr-btn-sm uscistr-btn-outline uscistr-timeline-fold',
        type: 'button',
        text: 'Show all (' + items.length + ')',
        onclick: function () { caseUi(entry).showAllEvents = true; render(); }
      }));
    } else if (showAll && items.length > TIMELINE_FOLD + 1) {
      wrap.appendChild(el('button', {
        'class': 'uscistr-btn uscistr-btn-sm uscistr-btn-ghost uscistr-timeline-fold',
        type: 'button',
        text: 'Show fewer',
        onclick: function () { caseUi(entry).showAllEvents = false; render(); }
      }));
    }
    return wrap;
  }

  // ---- progress module ------------------------------------------------------

  // The stage type a code is activity for, or null. "Activity for", not
  // "completion of": an interview can be scheduled (FJ) and then cancelled
  // (FKB), and both are interview-step activity — the timeline row carries
  // which one it was.
  function stageTypeOfCode(code) {
    if (!code) return null;
    if (typeof USCIS_CODE_STAGES === 'undefined') return null;
    return USCIS_CODE_STAGES[String(code).toUpperCase()] || null;
  }

  // Build the case's stage map from its own evidence. Returns
  //   { stages: [ { type, label, state, at } ... ],   ordered for display
  //     formType, closed, unmapped: [codes] }
  // where state is one of:
  //   'evidenced'    USCIS logged activity at this step (code, document, or a
  //                  dated notice). Never a claim the step completed.
  //   'current'      the open case's present position — always Under review
  //   'not-reported' this form's instructions provide for the step, and
  //                  nothing on the case reports it. Verified against a live
  //                  account: USCIS does not report biometrics through these
  //                  endpoints even when an appointment took place, so absence
  //                  of evidence here is NOT evidence the step didn't happen.
  //   'ahead'        the definitional stages not yet reached
  //
  // There is no per-form sequence and therefore no index to defend: no
  // mismatch mode, no monotonic stickiness, no appointment clamp. Ordering is
  // the case's own timestamps, with only two definitional pins — Received
  // first, Decision (then Card) last.
  function stageInfo(entry, view) {
    var formType = view.detail && view.detail.formType ? String(view.detail.formType).toUpperCase()
      : (view.notice && view.notice.formNumber ? String(view.notice.formNumber).toUpperCase() : null);
    // Strict === true, the same rule every other consumer of this boolean
    // follows: state may come only from a structured boolean USCIS sent.
    // Found by fuzzing — with truthy coercion, a malformed closed:"false"
    // (a STRING) renders the case as finished.
    var closed = !!(view.detail && view.detail.closed === true);
    var now = new Date().getTime();
    var i;

    // -- Gather evidence: earliest timestamp per stage type ------------------
    var evidence = {};   // type -> { at: ms|null }
    var unmapped = [];
    var seenUnmapped = {};
    function addEvidence(type, at) {
      if (!type) return;
      if (!evidence[type]) { evidence[type] = { at: at }; return; }
      if (at !== null && (evidence[type].at === null || at < evidence[type].at)) {
        evidence[type].at = at;
      }
    }
    function addCode(code, at) {
      if (!code) return;
      var type = stageTypeOfCode(code);
      if (type) { addEvidence(type, at); return; }
      var key = String(code).toUpperCase();
      if (!seenUnmapped[key]) { seenUnmapped[key] = true; unmapped.push(key); }
    }

    if (view.notice && view.notice.actionCode) {
      addCode(view.notice.actionCode,
        view.notice.actionCodeDate ? parseUscisDate(view.notice.actionCodeDate) : null);
    }
    for (i = 0; i < view.items.length; i++) {
      var item = view.items[i];
      addCode(item.code, item.displayAt);
      // A past appointment is evidence in itself: the notice is structured
      // data with a date. Its TYPE is deliberately not inferred — biometrics
      // and interview notices arrive as identical generic records.
      if (item.kind === 'appointment') addEvidence('appointment', item.displayAt);
      // USCIS-generated documents carry USCIS's own wording in `type`; the
      // reviewed mapping below is exact-match only.
      if (item.kind === 'document' && item.docStageType) addEvidence(item.docStageType, item.displayAt);
    }
    for (i = 0; i < view.upcoming.length; i++) {
      var up = view.upcoming[i];
      addCode(up.code, up.displayAt);
      if (up.kind === 'appointment') addEvidence('appointment', up.displayAt);
    }
    // Structured evidence requests outrank code inference.
    if (view.evidenceCount > 0) addEvidence('evidence', null);

    // -- Assemble stages -----------------------------------------------------
    function labelFor(type) {
      var overrides = formType ? STAGE_LABEL_OVERRIDES[formType] : null;
      return (overrides && overrides[type]) || STAGE_TYPE_LABELS[type];
    }

    var stages = [];

    // Received: definitional — the case exists because the filing arrived.
    // Dated by the filing anchor when present, upgraded by receipt codes.
    var receivedAt = view.detail && view.detail.submissionDate
      ? parseUscisDate(view.detail.submissionDate) : null;
    if (evidence.received && evidence.received.at !== null &&
        (receivedAt === null || evidence.received.at < receivedAt)) {
      receivedAt = evidence.received.at;
    }
    stages.push({ type: 'received', label: labelFor('received'), state: 'evidenced', at: receivedAt, sort: -Infinity });

    // Evidenced middle steps, by their own earliest timestamps. Future-dated
    // evidence (an upcoming appointment) sorts after "now", which places it
    // past the current marker without any clamp: date order does the work.
    var MIDDLE = ['appointment', 'biometrics', 'evidence', 'interview'];
    for (i = 0; i < MIDDLE.length; i++) {
      var mt = MIDDLE[i];
      if (evidence[mt]) {
        stages.push({ type: mt, label: labelFor(mt), state: 'evidenced',
          at: evidence[mt].at,
          sort: evidence[mt].at === null ? now - 2 : evidence[mt].at });
      }
    }

    // Expected-but-unreported steps, from the form's own instructions. One
    // stage per type: evidence above already claimed the type if any exists.
    var expected = formType ? FORM_EXPECTED_STEPS[formType] : null;
    if (expected) {
      for (i = 0; i < expected.length; i++) {
        if (!evidence[expected[i]]) {
          stages.push({ type: expected[i], label: labelFor(expected[i]),
            state: 'not-reported', at: null, sort: now - 1 });
        }
      }
    }

    // Under review: the open case's present position — a statement of where
    // the case sits, not a claim review activity occurred. On a closed case
    // it appears only when evidenced, as history.
    if (!closed) {
      stages.push({ type: 'review', label: labelFor('review'), state: 'current',
        at: evidence.review ? evidence.review.at : null, sort: now });
    } else if (evidence.review) {
      stages.push({ type: 'review', label: labelFor('review'), state: 'evidenced',
        at: evidence.review.at, sort: evidence.review.at === null ? now : evidence.review.at });
    }

    // Decision: definitional endpoint. Evidenced by a decision code, or by
    // the structured `closed` boolean — which says the case ended, never how.
    var decisionState = (evidence.decision || closed) ? 'evidenced' : 'ahead';
    stages.push({ type: 'decision', label: labelFor('decision'), state: decisionState,
      at: evidence.decision ? evidence.decision.at : null, sort: Infinity });

    // Card/document production: only ever shown when evidenced, pinned after
    // Decision — production follows a decision by definition.
    if (evidence.card) {
      stages.push({ type: 'card', label: labelFor('card'), state: 'evidenced',
        at: evidence.card.at, sort: Infinity });
    }

    stages.sort(function (a, b) {
      if (a.sort !== b.sort) return a.sort - b.sort;
      return 0;
    });
    // The sort above keeps Decision and Card at Infinity in insertion order,
    // which is already Decision-then-Card.

    return { stages: stages, formType: formType, closed: closed, unmapped: unmapped };
  }

  // Never more than 5 segments on screen at 400px. When evidence produces
  // more, NOT-REPORTED markers drop first — they carry the least information
  // and their caveat lives in the disclosure — and only then do the earliest
  // stages collapse into a single "Filed" cap. The first version collapsed
  // from the front unconditionally, which on a six-stage card swallowed
  // "Evidence requested" — the one stage that represents a demand — while
  // keeping a dashed marker that says nothing happened.
  function stageSegments(info) {
    var stages = info.stages;
    if (stages.length <= 5) return stages;
    var kept = [];
    for (var i = 0; i < stages.length; i++) {
      if (stages[i].state !== 'not-reported') kept.push(stages[i]);
    }
    if (kept.length <= 5) return kept;
    var keep = kept.slice(kept.length - 4);
    var swallowed = kept.slice(0, kept.length - 4);
    var anyEvidenced = false;
    for (i = 0; i < swallowed.length; i++) {
      if (swallowed[i].state === 'evidenced') anyEvidenced = true;
    }
    return [{
      type: 'collapsed', label: 'Filed', state: anyEvidenced ? 'evidenced' : 'ahead',
      at: swallowed[0].at, collapsed: swallowed
    }].concat(keep);
  }

  // Four states. Filled means "USCIS logged activity at this step" — never
  // that the step completed. The not-reported mark exists because absence of
  // evidence is not evidence of absence here: USCIS does not report
  // biometrics through these endpoints at all, verified against a live
  // account whose owner attended one. Claiming an interview or a biometrics
  // appointment happened when nothing says so — or that it did NOT happen
  // when USCIS simply doesn't say — are both false statements about someone's
  // own case, and the two-state rail could only avoid one of them.
  function buildStageRail(info) {
    var segments = stageSegments(info);
    var rail = el('div', { 'class': 'uscistr-stage', role: 'img' });
    var current = null;
    var i;
    for (i = 0; i < segments.length; i++) {
      var seg = segments[i];
      var stateClass;
      var glyph;
      var title;
      if (seg.state === 'current') {
        stateClass = 'uscistr-is-current';
        glyph = 'pulse';
        current = seg;
        title = seg.label;
      } else if (seg.state === 'evidenced') {
        // A closed case's Decision is evidenced by the structured `closed`
        // boolean, which says the case ended — never how. The cap glyph marks
        // a terminus rather than an achievement.
        var terminal = seg.type === 'decision' || seg.type === 'card' || seg.collapsed;
        stateClass = 'uscistr-is-done';
        glyph = terminal ? 'cap' : 'disc';
        title = seg.label + (seg.at !== null && seg.at !== undefined
          ? ' — ' + formatDateAs(seg.at, 'day') : '');
      } else if (seg.state === 'not-reported') {
        stateClass = 'uscistr-is-unreported';
        glyph = 'ring';
        title = seg.label + ' — this form can involve this step, and USCIS does not report it in this data. Not reported is not the same as not done.';
      } else {
        stateClass = 'uscistr-is-ahead';
        glyph = 'ring';
        title = seg.label;
      }

      var node = el('div', { 'class': 'uscistr-stage-node' });
      var icon = buildIcon(glyph);
      if (icon) node.appendChild(icon);

      var segEl = el('div', { 'class': 'uscistr-stage-seg ' + stateClass }, [
        node,
        el('div', { 'class': 'uscistr-stage-label', text: seg.label, title: title }),
        seg.state === 'current' ? el('div', { 'class': 'uscistr-stage-here', text: '▲ you are here' }) : null
      ]);
      rail.appendChild(segEl);
    }
    var ariaBits = [];
    for (i = 0; i < segments.length; i++) {
      var s = segments[i];
      ariaBits.push(s.label + (s.state === 'current' ? ' (current position)'
        : s.state === 'not-reported' ? ' (not reported in this data)'
        : s.state === 'ahead' ? ' (ahead)' : ''));
    }
    rail.setAttribute('aria-label', 'Stage map built from this case’s own record: ' +
      ariaBits.join(', ') + '.' + (info.closed ? ' USCIS marks this case closed.' : ''));
    return rail;
  }

  // Days since the most recent movement, against this case's own longest
  // previous quiet stretch. Honest (it makes no claim about USCIS), personal
  // (it compares the user only to themselves), and it changes between visits
  // even when the case does not.
  function quietInfo(view) {
    var times = [];
    var now = new Date().getTime();
    var i;
    for (i = 0; i < view.items.length; i++) {
      var item = view.items[i];
      if (item.kind === 'backend') continue;   // would reset the counter without the user learning anything
      if (item.provenance !== 'official' && item.provenance !== 'coded' &&
          item.provenance !== 'notice' && item.provenance !== 'document') continue;
      if (item.displayAt === null || item.displayAt === undefined) continue;
      if (item.displayAt > now) continue;
      times.push(item.displayAt);
    }
    // Under three movements there is no rhythm to compare against yet.
    if (times.length < 3) return null;
    times.sort(function (a, b) { return a - b; });

    var maxPrior = 0;
    for (i = 1; i < times.length; i++) {
      var gap = daysBetween(times[i - 1], times[i]);
      if (gap > maxPrior) maxPrior = gap;
    }
    var current = daysBetween(times[times.length - 1], now);
    // Something moved today: there is no quiet stretch to measure.
    if (current <= 0) return null;
    return { currentDays: current, maxPriorDays: maxPrior };
  }

  // A sentence, not a gauge. A filling bar implies progress toward a goal, and
  // the only goal this one could measure is the user's own worst wait — which
  // every still-waiting case eventually exceeds, at which point the module's
  // only message is "you are now waiting longer than you ever have". So: no
  // bar, and once the current stretch passes the previous longest the
  // comparator is dropped rather than announced as a record.
  function buildQuietLine(quiet) {
    return el('div', { 'class': 'uscistr-quiet' }, [
      el('div', { 'class': 'uscistr-quiet-head' }, [
        el('span', { text: 'Quiet for ' + plural(quiet.currentDays, 'day') }),
        quiet.currentDays < quiet.maxPriorDays
          ? el('span', { 'class': 'uscistr-muted', text: 'longest so far: ' + plural(quiet.maxPriorDays, 'day') })
          : null
      ]),
      el('div', { 'class': 'uscistr-progress-label', text:
        // Positively, and once. This read "It is not a comparison with anyone
        // else, and it is not a warning" — and nothing else on the card denies
        // being a warning, so the denial was what made it sound like one.
        'Measured against this case’s own history. Quiet stretches of weeks or months are ordinary in these records.' })
    ]);
  }

  function buildProgressModule(entry, view) {
    var wrap = el('div', { 'class': 'uscistr-progress' });
    var detail = view.detail;
    var filedMs = detail && detail.submissionDate ? parseUscisDate(detail.submissionDate) : null;

    // B2 — elapsed framing. The numeric anchor, never a prediction.
    if (filedMs !== null) {
      var day = daysBetween(filedMs, new Date().getTime());
      wrap.appendChild(el('div', { 'class': 'uscistr-progress-head' }, [
        el('b', { text: 'Day ' + day }),
        el('span', { 'class': 'uscistr-muted', text: 'filed ' + formatDateFull(detail.submissionDate) })
      ]));
    } else {
      wrap.appendChild(el('div', { 'class': 'uscistr-progress-head' }, [
        el('b', { text: 'Filing date not in this record' }),
        el('span')
      ]));
    }

    // B1 — the stage rail. Equal-width segments: the geometry carries no time
    // information, so it cannot be misread as a gauge. Every case with data
    // gets a map now — an unknown form gets the definitional spine rather
    // than nothing, because the form universe is open and "never seen" is the
    // normal case, not the edge case.
    var info = stageInfo(entry, view);
    wrap.appendChild(buildStageRail(info));
    if (info.closed) {
      wrap.appendChild(el('div', { 'class': 'uscistr-progress-label', text:
        'USCIS marks this case closed, so the map ends here.' }));
    }
    // Nothing is printed about what comes next. We have no population data
    // and never will: "cases at this stage usually move to X" was invented,
    // and steps appear only when this case's own record evidences them.
    // Standing methodology is disclosed rather than printed: identical on
    // every card, so it lives one click away instead of pushing the actual
    // events off the first screen.
    var railNotes = [];
    // Gate the dashed-marker note on the segments actually drawn: a crowded
    // rail drops not-reported markers first, and a note explaining a marker
    // that is not on screen would be describing nothing.
    var drawnSegs = stageSegments(info);
    var hasUnreported = false;
    for (var si = 0; si < drawnSegs.length; si++) {
      if (drawnSegs[si].state === 'not-reported') hasUnreported = true;
    }
    if (hasUnreported) {
      railNotes.push('A dashed marker means this form’s own USCIS instructions provide for the step, and nothing in this data reports it. USCIS does not report biometrics through these endpoints at all — even when an appointment took place — so “not reported” never means “not done”.');
    }
    if (info.unmapped.length) {
      railNotes.push('Codes with no published meaning (' + info.unmapped.join(', ') +
        ') are in the timeline but do not move this map.');
    }
    if (STAGE_FOOTNOTES[info.formType]) railNotes.push(STAGE_FOOTNOTES[info.formType]);
    railNotes.push('This map is built from this case’s own record: a step appears only when USCIS logged activity for it, in the order the record shows, and a filled marker means activity was logged — not that the step is finished. Received, Under review and Decision appear on every case because every case has them. Segments are equal width on purpose: none of them measures time.');

    var railOpen = !!caseUi(entry).showRailNote;
    var railBtn = el('button', {
      'class': 'uscistr-more', type: 'button',
      'aria-expanded': railOpen ? 'true' : 'false',
      'data-focus-key': 'railNote:' + entry.number,
      text: railOpen ? 'Hide' : 'How this map is read',
      onclick: function () { caseUi(entry).showRailNote = !caseUi(entry).showRailNote; render(); }
    });
    wrap.appendChild(railBtn);
    if (railOpen) {
      var railNote = el('div', { 'class': 'uscistr-disclosure' });
      for (var rn = 0; rn < railNotes.length; rn++) {
        railNote.appendChild(el('p', { text: railNotes[rn] }));
      }
      linkDisclosure(railBtn, railNote);
      wrap.appendChild(railNote);
    }

    // A closed case has stopped waiting, so none of the waiting machinery
    // below it runs: no quiet counter, and no percentage-complete on a case
    // that is complete.
    if (detail && detail.closed) return wrap;

    // B3 — the quiet stretch.
    var quiet = quietInfo(view);
    if (quiet) wrap.appendChild(buildQuietLine(quiet));

    // A percentage exists ONLY when USCIS itself published a range for this
    // case. That endpoint answers 204 for almost every case, so this almost
    // never renders — and it is never synthesized from elapsed time alone.
    var months = view.estimateMonths;
    var progress = (view.processing && detail && detail.submissionDate)
      ? progressInfo(detail.submissionDate, months) : null;
    if (progress) {
      var fill = el('div', { 'class': 'uscistr-progress-fill' });
      fill.style.width = progress.pct + '%';
      wrap.appendChild(el('div', { 'class': 'uscistr-progress-track', role: 'img',
        'aria-label': progress.pct + ' percent through the range USCIS published for this case' }, [fill]));
      wrap.appendChild(el('div', { 'class': 'uscistr-progress-label', text:
        progress.pct + '% through the range USCIS published for this case (' +
        String(view.processing.estimate) + ').' }));
      // No ETA is printed from this. A range describes cases that already
      // finished; turning it into a date for THIS case would be the predicted
      // decision date the spec rejects outright.
      wrap.appendChild(el('div', { 'class': 'uscistr-progress-label', text:
        'That range describes cases USCIS has already finished. It is not a prediction about this one, and it is not a decision date.' }));
    } else if (filedMs !== null) {
      // "We could not read it" and "USCIS publishes none" are different
      // claims, and collapsing them would be its own small dishonesty. The
      // The reasoning behind an absent estimate is the same on every card, so
      // it is stated plainly here instead of hanging a "Why is there no
      // estimate?" button off each one.
      //
      // Three outcomes, not two. USCIS sometimes publishes a range in a shape
      // we cannot read — weeks rather than months, or a median with no range —
      // and calling that "publishes none" is the same collapse of "we could not
      // read it" into "there is nothing" that the rest of this panel refuses.
      var absenceText;
      if (view.estimateUnread) {
        absenceText = "USCIS's processing-time endpoint could not be read on this check, " +
          'so whether one is published for this case is unknown.';
      } else if (view.processing) {
        absenceText = 'USCIS published a processing-time estimate for this case in a form ' +
          'this panel could not read. Check my.uscis.gov for it.';
      } else {
        absenceText = 'USCIS publishes no processing-time estimate for this case.';
      }
      wrap.appendChild(el('div', { 'class': 'uscistr-progress-label', text: absenceText }));
    }
    return wrap;
  }

  // ---- case card ------------------------------------------------------------

  // The state pills that sit on the eyebrow line, left of the form name.
  //
  // Colour encodes state ONLY from a structured boolean the API sent. Never
  // from status prose: we cannot classify an outcome from a sentence, so
  // nothing here is allowed to read as good or bad news. That is why the
  // default pill is neutral grey and says "In progress" rather than anything
  // that could be heard as reassurance.
  function stateChips(entry, view) {
    var chips = [];
    var detail = view.detail;
    if (!detail) return chips;
    if (detail.actionRequired) {
      chips.push(chip('Action required', 'warn', true));
    } else if (detail.closed) {
      // `closed === true` gets the settled/neutral treatment, not a green one:
      // closed says the file is finished, not that it went the user's way.
      chips.push(chip('Closed', 'neutral', true));
    } else if (detail.closed === false) {
      // The one derived pill, and it is still derived from a boolean USCIS
      // sent rather than from anything we read in the status text.
      chips.push(chip('In progress', 'neutral', true));
    }
    if (detail.premium) chips.push(chip('Premium', 'info'));
    return chips;
  }

  function buildCardHeader(entry, view) {
    var eyebrowChildren = [];
    var formType = view.detail && view.detail.formType ? String(view.detail.formType) : null;
    if (!formType) {
      // This check failed, but our own last snapshot still knows what this
      // case is. Identity should not vanish because a fetch did.
      var lastKnown = getSnapshot(entry.number);
      if (snapshotHasContent(lastKnown) && lastKnown.formType) formType = String(lastKnown.formType);
    }
    if (formType) eyebrowChildren.push(el('span', { 'class': 'uscistr-chip uscistr-chip-form', text: formType }));
    // The eyebrow carries identity and state only. The official form name is
    // up to 60 characters and wraps to two lines; putting it on this line
    // buries the state pill and makes every card open the same way.
    var pills = stateChips(entry, view);
    for (var p = 0; p < pills.length; p++) eyebrowChildren.push(pills[p]);

    var formName = view.detail && view.detail.formName ? String(view.detail.formName) : null;
    var titleText = formName || entry.label || 'Case';

    var receiptText = displayNumber(entry.number);
    var receiptBtn = el('button', {
      'class': 'uscistr-receipt' + (state.prefs.redact ? ' uscistr-is-redacted' : ''),
      type: 'button',
      title: 'Copy receipt number',
      onclick: function () {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(entry.number);
        } catch (e) { /* clipboard unavailable: the number is on screen anyway */ }
      }
    }, [el('span', { text: receiptText })]);
    var copyIcon = buildIcon('copy');
    if (copyIcon) receiptBtn.appendChild(copyIcon);

    var identity = el('div', { 'class': 'uscistr-card-title' }, [
      eyebrowChildren.length ? el('div', { 'class': 'uscistr-card-eyebrow' }, eyebrowChildren) : null,
      el('div', { 'class': 'uscistr-card-label', text: titleText }),
      receiptBtn,
      entry.label && formName ? el('div', { 'class': 'uscistr-muted uscistr-small', text: entry.label }) : null
    ]);

    // "Something moved" is the one thing a returning reader is looking for, so
    // it gets the top-right corner to itself rather than queueing behind the
    // state pills on the left.
    var actions = el('div', { 'class': 'uscistr-card-actions' });
    if (entry.changedSince) actions.appendChild(chip('NEW', 'accent'));
    actions.appendChild(iconButton('minimize', 'Collapse this case', function (e) {
      e.stopPropagation();
      setExpanded(entry.number, false);
      render();
    }));

    return el('div', { 'class': 'uscistr-card-header' }, [identity, actions]);
  }

  // "Something moved, here is what it was, here is the window it moved in."
  // Always names the previous value: a change with no "from" is a jump-scare.
  function buildChangeBand(entry) {
    if (!entry.changedSince) return null;
    var changes = entry.newChanges || [];
    var lines = [];
    var i;
    for (i = 0; i < changes.length && i < 3; i++) {
      var change = changes[i];
      if (change.kind === 'status') {
        lines.push('The status is now "' + change.to + '"' +
          (change.from ? ' (it was "' + change.from + '").' : '.'));
      } else if (change.kind === 'office') {
        lines.push('Office on record changed' + (change.from ? ' from ' + change.from : '') + ' to ' + change.to + '.');
      } else if (change.kind === 'document') {
        lines.push('New document on file: ' + displayFileName(change.to) + '.');
      } else if (change.kind === 'backend') {
        lines.push("USCIS's record was updated. The public status text did not change.");
      }
    }
    if (!lines.length) lines.push('Something in this record changed since the last check.');

    // One flowing sentence, not a title plus a stack of body lines. This band
    // sits above the status headline on every changed card, so every row it
    // costs is a row of push-down on the thing the reader came to see. The
    // short date keeps the lead on one line; the full date and every change
    // line stay reachable in the tooltip and in the timeline below.
    var lastLookedMs = entry.lastLookedAt ? parseUscisDate(entry.lastLookedAt) : null;
    // "2 changes since Aug 11" on Aug 11 reads as a bug, and it is the first
    // sentence a returning reader sees. A date is only worth printing once it
    // is a different day from today.
    var sinceShort = (lastLookedMs === null || sameLocalDay(lastLookedMs, new Date().getTime()))
      ? null : formatDayLabel(lastLookedMs);
    var lead = plural(changes.length || 1, 'change') +
      (sinceShort ? ' since ' + sinceShort : ' since you last looked');

    var body = el('div', {}, [
      el('b', { text: lead }),
      document.createTextNode(' — ' + lines[0])
    ]);
    if (lines.length > 1) {
      body.appendChild(document.createTextNode(' ' + lines.slice(1).join(' ')));
    }

    var band = el('div', {
      'class': 'uscistr-change',
      title: (entry.lastLookedAt
        ? plural(changes.length || 1, 'change') + ' since the last check on ' + formatDateFull(entry.lastLookedAt)
        : lead) + '\n' + lines.join('\n')
    });
    var icon = buildIcon('shield');
    band.appendChild(icon || el('span'));
    band.appendChild(body);
    band.appendChild(el('button', {
      'class': 'uscistr-btn uscistr-btn-sm', type: 'button', text: 'Mark seen',
      title: 'Clears the marker. The entry stays in the timeline.',
      onclick: function () {
        entry.changedSince = false;
        entry.newChanges = null;
        // Clearing it has to persist too, or the marker comes back on reload.
        persistCases();
        render();
      }
    }));
    return band;
  }

  // Outranks everything on the card when present, because it has a deadline
  // attached. Never states what the user must do or by when.
  function buildObligationBand(entry, view) {
    var detail = view.detail;
    var now = new Date().getTime();

    // Appointments are NOT raised as a warning banner here. They are rendered
    // once, by buildUpcomingBand, in the restrained tinted treatment — a date
    // on the calendar is an obligation, not an alarm, and the amber banner
    // said "something is wrong" about a routine biometrics slot. Raising it
    // here as well printed the same appointment twice on the same card.
    if (detail && detail.actionRequired) {
      return banner('', 'warning', 'This case is marked "action required" by USCIS.', [
        'Sign in to my.uscis.gov and open the case to see what they are asking for.',
        'This panel can see the flag but not the request itself.'
      ], null);
    }
    if (view.evidenceCount > 0) {
      return banner('', 'warning', plural(view.evidenceCount, 'request') + ' for evidence is attached to this record.', [
        'Open the case on my.uscis.gov for the document and the deadline.'
      ], null);
    }
    // A just-attended or just-missed appointment stays visible for a week.
    for (var i = 0; i < view.items.length; i++) {
      var item = view.items[i];
      if (item.kind !== 'appointment' || item.displayAt === null) continue;
      if (now - item.displayAt > 7 * MS_PER_DAY) continue;
      return banner('info', 'calendar', 'Appointment on record: ' + formatWeekday(item.displayAt) + ', ' + formatDateFull(item.displayAt), [
        'This date has passed. The notice USCIS sent you is the authority on what happened.'
      ], null);
    }
    return null;
  }

  // A dated obligation, in the restrained tinted treatment rather than an
  // amber alarm. It sits above the status headline because it is the only
  // thing on the card with a deadline attached, and it carries the authority
  // caveat once, quietly, instead of as its own paragraph.
  function buildUpcomingBand(view) {
    if (!view.upcoming.length) return null;
    var wrap = el('div', { 'class': 'uscistr-stack' });
    var now = new Date().getTime();
    for (var u = 0; u < view.upcoming.length; u++) {
      var appt = view.upcoming[u];
      var apptZone = localZoneLabel(appt.displayAt);
      var iconWrap = el('span');
      var calIcon = buildIcon('calendar');
      if (calIcon) iconWrap.appendChild(calIcon);
      wrap.appendChild(el('div', {
        'class': 'uscistr-upcoming',
        title: 'Confirm the time and address on the notice USCIS sent you — that notice is the authority, not this panel.'
      }, [
        iconWrap,
        el('div', {}, [
          el('div', { 'class': 'uscistr-upcoming-title', text:
            appt.label + ' · ' + formatWeekday(appt.displayAt) + ', ' + formatDateFull(appt.displayAt) }),
          // USCIS sends this as a correctly-converted UTC instant: a 3:00 PM
          // Eastern appointment arrives as 19:00Z (verified against a real
          // notice — see docs/API-SCHEMA.md, notices[].appointmentDateTime).
          // Rendering it in this computer's clock therefore gives the right
          // wall time for anyone whose machine is set to the office's zone,
          // which is the normal case.
          //
          // It is wrong for someone travelling with a laptop still on another
          // zone, and we cannot detect that. So the label names whose clock
          // this is, and names the notice as the authority in the same breath —
          // a time is the one value here where acting on the wrong number means
          // missing an appointment.
          //
          // Three comment blocks used to sit here, two of them asserting
          // different things about the same field: one said the payload carries
          // "no office timezone" and the other that it is correctly converted.
          // Only the second is true. On this value in particular, a comment
          // that contradicts its neighbour is how the next person reintroduces
          // the bug 1.3.0–1.3.4 already argued its way out of.
          appt.precision === 'day' ? el('div', { 'class': 'uscistr-upcoming-meta', text:
            'USCIS gave a date for this but no time. Your notice has the time on it.' })
          : el('div', { 'class': 'uscistr-upcoming-meta', text:
            formatTimeOfDay(appt.displayAt) +
            (apptZone ? ' ' + apptZone : '') +
            ' · shown in your device’s time zone, which may not be the office’s.' +
            // Labelled, never bare. An unlabelled nine-digit number in
            // parentheses at the end of a sentence is indistinguishable from
            // a leaked internal id.
            ' If this differs from your notice, follow the notice' +
            (appt.letterId ? ' — letter ' + appt.letterId : '') + '.' })
        ]),
        el('span', { 'class': 'uscistr-upcoming-meta', text:
          'in ' + plural(daysBetween(now, appt.displayAt), 'day') })
      ]));
    }
    return wrap;
  }

  // The exact wording here is read hundreds of times by the same person. No
  // exclamation, no "still", no cheerleading, no number in a warning colour.
  // `backendMoved` is true when USCIS touched the record more recently than the
  // status changed. In that case "No change" alone contradicts the record-
  // updated note sitting a few lines below it, so the subject becomes the
  // visible status specifically.
  function noChangeLine(days, lastChangeMs, nothingPending, backendMoved) {
    if (days === null) return null;
    if (days <= 0) return 'Changed today.';

    var subject = backendMoved ? 'No visible status change' : 'No change';

    if (days <= 6) {
      return subject + ' since ' + formatWeekday(lastChangeMs) + ', ' + formatDateFull(lastChangeMs) +
        ' — ' + plural(days, 'day') + '.';
    }
    if (days <= 29) {
      return subject + ' for ' + plural(days, 'day') + '. Last change ' + formatDateFull(lastChangeMs) + '.';
    }
    if (days <= 89) {
      return subject + ' for ' + plural(days, 'day') + '. Quiet stretches of weeks or months are ordinary in these records.';
    }
    if (days <= 364) {
      return subject + ' for ' + plural(days, 'day') + '. Long quiet periods are ordinary here.' +
        (nothingPending ? ' Nothing in this record is asking anything of you.' : '');
    }
    return subject + ' for ' + longDuration(days) + '. This panel is still checking, and will still record the day it changes.';
  }

  function buildStatusBlock(entry, view) {
    var notice = view.notice;
    var block = el('div', { 'class': 'uscistr-status-block' });
    var spanish = !!caseUi(entry).spanish;

    // The headline is body text. It is never green, never red: we cannot
    // classify approval or denial from prose, and a colour would deliver a
    // verdict before the person has read a word.
    var headline = notice && notice.status
      ? (spanish && notice.statusSpanish ? notice.statusSpanish : notice.status)
      : "USCIS hasn't published a status for this case yet.";
    block.appendChild(el('div', { 'class': 'uscistr-status-text', text: headline }));

    // Status age: the absolute date leads because it is the verifiable one.
    var statusMs = null;
    if (notice && notice.actionCodeDate) statusMs = parseUscisDate(notice.actionCodeDate);
    if (statusMs === null) {
      for (var i = 0; i < view.items.length; i++) {
        if (view.items[i].provenance === 'official' && view.items[i].displayAt !== null) {
          statusMs = view.items[i].displayAt;
          break;
        }
      }
    }
    var ageRow = el('div', { 'class': 'uscistr-status-row' });
    var statusDays = statusMs === null ? null : daysBetween(statusMs, new Date().getTime());
    if (statusMs !== null) {
      // The day count is computed once, in whole calendar days, so this line
      // and the no-change line below can never disagree by a rounding step.
      var ageText;
      if (statusDays <= 0) ageText = 'Set today';
      else if (statusDays === 1) ageText = 'Set yesterday, ' + formatDateFull(statusMs);
      else ageText = 'Set ' + formatDateFull(statusMs) + ' · ' + plural(statusDays, 'day') + ' ago';
      ageRow.appendChild(el('span', { 'class': 'uscistr-muted uscistr-small', text: ageText }));
    } else if (view.detail && view.detail.backendAt) {
      ageRow.appendChild(el('span', { 'class': 'uscistr-muted uscistr-small', text:
        'Record dated ' + formatDateFull(view.detail.backendAt) }));
    }
    if (view.detail && view.detail.closed) {
      ageRow.appendChild(chip('This case is closed', 'neutral'));
    }
    if (ageRow.childNodes.length) block.appendChild(ageRow);

    if (statusMs !== null) {
      var nothingPending = !!(view.detail && view.detail.actionRequired === false) &&
        view.evidenceCount === 0 && view.upcoming.length === 0;
      // Whether the record moved after the status did. The backend note below
      // says so explicitly, so this line must not flatly claim "no change".
      var backendMs = (view.detail && view.detail.backendAt)
        ? parseUscisDate(view.detail.backendAt) : null;
      var backendMoved = backendMs !== null && statusMs !== null && backendMs > statusMs;
      var line = noChangeLine(statusDays, statusMs, nothingPending, backendMoved);
      if (line) block.appendChild(el('div', { 'class': 'uscistr-muted uscistr-small', text: line }));
    }

    // The official paragraph is collapsed: it is 80-150 words that do not
    // change between visits, and expanded it would bury the answer to
    // "did anything move".
    var detailText = notice ? (spanish && notice.statusDetailSpanish ? notice.statusDetailSpanish : notice.statusDetail) : null;
    if (detailText) {
      var open = !!caseUi(entry).showStatusText;
      var para = el('div', {
        'class': 'uscistr-status-desc' + (open ? '' : ' uscistr-is-clamped'),
        text: detailText
      });
      block.appendChild(para);
      var moreBtn = el('button', {
        'class': 'uscistr-more', type: 'button',
        'aria-expanded': open ? 'true' : 'false',
        'data-focus-key': 'statusText:' + entry.number,
        text: open ? 'Show less' : 'Show full text',
        onclick: function () { caseUi(entry).showStatusText = !caseUi(entry).showStatusText; render(); }
      });
      linkDisclosure(moreBtn, para);
      block.appendChild(moreBtn);
    }

    // USCIS ships its own Spanish. This toggle swaps only USCIS-authored
    // strings — never a machine translation of our own chrome.
    if (notice && (notice.statusSpanish || notice.statusDetailSpanish)) {
      block.appendChild(el('button', {
        'class': 'uscistr-more', type: 'button',
        'aria-pressed': spanish ? 'true' : 'false',
        title: spanish
          ? 'Switch this status back to the English wording USCIS published.'
          : 'Show the Spanish wording USCIS published for this status. The rest of this panel stays in English.',
        // Labelled for what it does — swap USCIS's own status wording — rather
        // than "Español", which promises a Spanish interface and delivers one
        // Spanish paragraph inside an English explanation.
        text: spanish ? 'Ver en inglés' : 'Ver estado en español',
        onclick: function () { caseUi(entry).spanish = !caseUi(entry).spanish; render(); }
      }));
    }
    return block;
  }

  // Real, verified, and invisible on my.uscis.gov — and never called progress,
  // never called good news, with no call to action because there is no action.
  function buildBackendNote(entry, view) {
    var detail = view.detail;
    var notice = view.notice;
    if (!detail || !detail.backendAt || !notice || !notice.actionCodeDate) return null;
    var backendMs = parseUscisDate(detail.backendAt);
    var statusMs = parseUscisDate(notice.actionCodeDate);
    if (backendMs === null || statusMs === null) return null;
    if (backendMs - statusMs <= BACKEND_MIN_LAG_MS) return null;

    var lag = daysBetween(statusMs, backendMs);
    var open = !!caseUi(entry).showBackendNote;
    var note = el('div', { 'class': 'uscistr-note' }, [
      el('div', { 'class': 'uscistr-note-title', text: 'Record updated after the current status' }),
      el('p', { text: "USCIS's record for this case was touched " + plural(lag, 'day') + ' after the status was set — on ' +
        formatDateFull(backendMs) + '. The public status page shows only the status, so this date does not appear there.' })
    ]);
    var backendMore = el('button', {
      'class': 'uscistr-more', type: 'button',
      'aria-expanded': open ? 'true' : 'false',
      'data-focus-key': 'backendNote:' + entry.number,
      text: open ? 'Show less' : 'Explain',
      onclick: function () { caseUi(entry).showBackendNote = !caseUi(entry).showBackendNote; render(); }
    });
    note.appendChild(backendMore);
    if (open) {
      var disclosed = el('div', { 'class': 'uscistr-disclosure' }, [
        el('p', { text: 'Every case in USCIS’s system carries a "last updated" date. For this case that date is ' +
          formatDateFull(backendMs) + ' — ' + plural(lag, 'day') + ' after the status above was written on ' + formatDateFull(statusMs) + '.' }),
        el('p', { text: 'So something in their system wrote to this case’s record after the status was set. That it happened is visible; what it was is not, and USCIS does not publish it anywhere.' }),
        // Four consecutive negations, naming "decision" and "approval" only to
        // deny them, put both words in front of someone who had not been
        // thinking either. One positive sentence carries the same fact.
        el('p', { text: 'It could be routine maintenance, an internal note, a batch job, or a step that has no public status. USCIS announces decisions in the status above, so that is where one would appear.' }),
        el('p', { text: 'It is shown because it is dated, verifiable, and part of the record — not because it means anything on its own.' })
      ]);
      linkDisclosure(backendMore, disclosed);
      note.appendChild(disclosed);
    }
    return note;
  }

  // Raised only from codes, and it says which code and where the reading came
  // from. Never states what the user must do or by when.
  // NOTE: this marks `item.attention` on the timeline items it matches, so it
  // MUST run before buildTimeline() or the attention styling silently does not
  // appear. buildCaseCard() relies on that ordering. Flagging on the items is
  // deliberate — the banner and the timeline row have to agree about which
  // event they are talking about, and re-deriving the match in two places is
  // how they would come to disagree.
  function buildAttentionBanner(view) {
    var found = null;
    var kind = null;
    var source = null;

    // USCIS's own structured answer wins. When the API says nothing is required
    // of this person, an old evidence-request code is a historical event, not a
    // live obligation — and the banner scans the whole history, so without this
    // an RFE answered two years ago and long since superseded by an approval
    // still said "USCIS has asked you for something. There is normally a
    // deadline." forever, directly above a status pill saying nothing is
    // required. `null` means USCIS did not say, so the codes still speak.
    if (view.detail && view.detail.actionRequired === false) return null;

    // A code older than this is not something to act on today. USCIS supplies
    // no deadline, so the only honest cutoff is the age of the event itself.
    var staleBefore = new Date().getTime() - ACTION_CODE_MAX_AGE_MS;

    for (var i = 0; i < view.items.length; i++) {
      var item = view.items[i];
      if (!item.code) continue;
      var category = ACTION_CODES[String(item.code).toUpperCase()];
      if (!category) continue;
      if (item.displayAt === null || item.displayAt === undefined) continue;
      if (item.displayAt < staleBefore) continue;
      item.attention = true;
      if (!found) {
        found = item;
        kind = category;
        source = item.provenance === 'coded' ? item.labelSource : 'official';
      }
    }
    if (!found) return null;

    var copy = ACTION_CODE_COPY[kind];
    var lines = [
      (found.label || ('Code ' + found.code)) + ' was logged on ' + formatDateFull(found.displayAt) +
        ' (code ' + found.code + ').',
      copy.line
    ];
    if (source === 'niem') {
      lines.push('This reading comes from the federal schema’s description of code ' + found.code +
        ', not from anything USCIS wrote about this case.');
    }
    // Amber, not red. This is a thing to do, not a verdict — and red next to an
    // immigration case reads as bad news about the case itself.
    return banner('', 'warning', copy.title, lines, null);
  }

  // Dates are the one place this panel reshapes what USCIS sent: the API
  // returns calendar dates and real instants in different shapes, and we read
  // each accordingly. If USCIS changes those shapes, our handling becomes the
  // thing that is wrong — so every date row carries the same standing note
  // that the notice governs.
  var DATE_CAVEAT = 'Read from USCIS data by this panel. If it disagrees with ' +
    'your notice or my.uscis.gov, those are correct.';

  function fieldRow(labelText, valueChildren, caveat) {
    var wrap = document.createDocumentFragment();
    wrap.appendChild(el('div', { 'class': 'uscistr-field-label', text: labelText }));
    wrap.appendChild(el('div', {
      'class': 'uscistr-field-value',
      title: caveat || null
    }, valueChildren));
    return wrap;
  }

  // Only what is not already stated above the fold. `Filed`, `Status updated`
  // and `Record touched` each restated a date the card has already given —
  // and one of them appended a "newer than status" chip that was the third
  // statement of the same fact, after the band and its explanation. Repeating a
  // date in a second format is how two numbers for one event end up disagreeing.
  function buildFieldRows(entry, view) {
    var wrap = el('div', { 'class': 'uscistr-fields' });
    var detail = view.detail;

    // People actively hunt for the office, so its absence is stated rather
    // than hidden.
    if (view.office) {
      wrap.appendChild(fieldRow('Service center', [
        el('span', { text: String(view.office) }),
        view.officeCode ? el('span', { 'class': 'uscistr-rel', text: '(' + view.officeCode + ')' }) : null
      ]));
    } else if (view.hasData) {
      wrap.appendChild(fieldRow('Service center', [
        el('span', { 'class': 'uscistr-muted', text: 'not listed in this record' })
      ]));
    }

    // No attorney is a normal state, not missing data: hide it when absent.
    if (detail && detail.representativeName) {
      wrap.appendChild(fieldRow('Representative', [el('span', {
        text: (state.prefs && state.prefs.redact) ? '[hidden]' : String(detail.representativeName)
      })]));
    }

    return wrap;
  }

  // Document URLs come from an undocumented API, so they are untrusted input.
  // Only same-origin my.uscis.gov links become clickable; anything else is
  // rendered as plain text. What has to be rejected:
  //   "javascript:..."                — script execution
  //   "//evil.com/x"                  — protocol-relative, resolves off-origin
  //   "https://my.uscis.gov.evil.com" — prefix match, different host
  //   "/\\evil.com/x", "/<TAB>/evil.com" — look relative, resolve off-origin
  //
  // Hand-rolled prefix checks cannot catch the last pair: the URL parser treats
  // a backslash as a separator and strips tab/CR/LF anywhere. So let the parser
  // resolve it, then compare the origin it actually produced.
  function isSafeDocUrl(url) {
    if (typeof url !== 'string' || !url) return false;
    try {
      var resolved = new URL(url, location.href);
      return resolved.protocol === 'https:' && resolved.hostname === 'my.uscis.gov';
    } catch (e) {
      return false;
    }
  }

  // USCIS names uploaded files by identifiers — "IOE0000000001-0000000000000
  // -part1.tif" — which tells a reader nothing. When the name is only ids,
  // lead with what the document is and where it came from; the raw filename
  // stays available as a tooltip.
  //
  // This function was called by buildDocuments but never defined: a latent
  // ReferenceError that fired the moment a card with documents rendered,
  // which made the whole panel disappear after loading. It escaped every
  // check because node --check only parses, and the smoke test asserted that
  // a panel appears — not that it survives a refresh.
  function documentLabel(doc) {
    var name = doc && doc.name ? String(doc.name) : '';
    if (/^[A-Za-z]{3}[0-9]{10}-[0-9]+-part[0-9]+/.test(name)) {
      var parts = [];
      if (doc.type) parts.push(String(doc.type));
      if (doc.source) parts.push(String(doc.source));
      if (parts.length) return parts.join(' · ');
    }
    // Redacted on the way out. USCIS names files after the receipt number, and
    // when type and source are both missing this falls through to the raw
    // name — printing the full number as the link text, on the same row as the
    // masked copy beside it.
    return displayFileName(name) || '(unnamed document)';
  }

  // A document counts as new when this panel recorded first seeing it within
  // the last week. USCIS provides no "new" flag, so this is our own
  // observation and is scoped to it.
  var NEW_DOCUMENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

  function isRecentDocument(name, historyList) {
    if (!name || !historyList || !historyList.length) return false;
    var cutoff = new Date().getTime() - NEW_DOCUMENT_WINDOW_MS;
    for (var i = 0; i < historyList.length; i++) {
      var entry = historyList[i];
      if (!entry || entry.kind !== 'document' || String(entry.to) !== String(name)) continue;
      var at = parseUscisDate(entry.at);
      if (at !== null && at >= cutoff) return true;
    }
    return false;
  }

  // Said only when the fetch succeeded and USCIS listed nothing — never when a
  // read failed. "USCIS lists none" and "we could not read the list" are
  // different claims.
  function documentsNoteText(entry, view) {
    if (!view || !view.hasData) return null;
    if (view.docs && view.docs.length) return null;
    // Gate on the documents endpoint specifically, not on whether the card has
    // any data at all. `hasData` is true whenever case detail or status
    // answered, so a documents endpoint that errored produced the flat
    // assertion "USCIS lists no documents on this case" — the exact collapse of
    // "we could not read it" into "there is nothing" this note exists to avoid.
    if (view.docsUnread) return null;
    return 'USCIS lists no documents on this case. That is not the same as there being none — ' +
      'documents sent by post may never appear here.';
  }

  // One box for the absence notes. Two stacked dashed boxes read as two
  // warnings about a case where nothing is wrong.
  function noteBox(paragraphs) {
    var box = el('div', { 'class': 'uscistr-note' });
    var any = false;
    for (var i = 0; i < paragraphs.length; i++) {
      if (!paragraphs[i]) continue;
      box.appendChild(el('div', { 'class': 'uscistr-small', text: paragraphs[i] }));
      any = true;
    }
    return any ? box : null;
  }

  // Six near-identical middle-ellipsised filenames cost more vertical space
  // than the entire timeline above them, and read as corrupted text. The count
  // and anything new are stated on the summary row; the list itself is opened
  // by people who want it.
  function buildDocuments(entry, view) {
    var docs = view.docs;
    if (!docs || !docs.length) return null;

    var list = buildDocumentList(entry, view);
    var wrap = el('div', { 'class': 'uscistr-docs-wrap' });
    var label = plural(docs.length, 'document') + ' on file';
    if (list.fresh) label += ' · ' + list.fresh + ' new';

    // Open/closed lives in caseUi like every other disclosure, so the 15-minute
    // background refresh cannot close a section someone is reading. Toggling
    // the DOM directly meant the documents list and the raw responses silently
    // shut on a timer while every other disclosure on the card stayed open.
    var docsOpen = !!caseUi(entry).showDocuments;
    var chevron = buildIcon('chevron');
    var toggle = el('button', {
      'class': 'uscistr-raw-toggle', type: 'button',
      'aria-expanded': docsOpen ? 'true' : 'false',
      'data-focus-key': 'docs:' + entry.number,
      onclick: function () { caseUi(entry).showDocuments = !docsOpen; render(); }
    });
    if (docsOpen) list.el.removeAttribute('hidden');
    toggle.appendChild(chevron || el('span'));
    toggle.appendChild(el('span', { text: label }));
    if (list.fresh) toggle.appendChild(chip('NEW', 'accent'));

    linkDisclosure(toggle, list.el);


    wrap.appendChild(toggle);
    wrap.appendChild(list.el);
    return wrap;
  }

  function buildDocumentList(entry, view) {
    var docs = view.docs;
    var fresh = 0;
    var historyList = view.history;
    var wrap = el('div', { 'class': 'uscistr-documents', hidden: 'hidden' });
    for (var i = 0; i < docs.length; i++) {
      var doc = docs[i];
      var label = documentLabel(doc);
      var fileName = doc.name ? String(doc.name) : '';
      var shownName = displayFileName(fileName);
      var isNew = !!(doc.name && isRecentDocument(fileName, historyList));
      if (isNew) fresh++;

      var iconWrap = el('span');
      var icon = buildIcon('doc');
      if (icon) iconWrap.appendChild(icon);

      var nameChildren = [];
      if (doc.name && isSafeDocUrl(doc.url)) {
        nameChildren.push(el('a', {
          'class': 'uscistr-link', href: doc.url, target: '_blank', rel: 'noopener noreferrer',
          text: label, title: shownName
        }));
      } else {
        nameChildren.push(el('span', { text: label }));
      }

      var meta = el('div', { 'class': 'uscistr-doc-meta' }, [
        doc.date ? el('span', { 'class': 'uscistr-doc-date', text: formatDate(doc.date) || String(doc.date) }) : null,
        isNew ? chip('NEW', 'accent') : null
      ]);

      // One line per document. The human-readable source leads and the raw
      // filename trails it in mono, shrinking first — stacking them made every
      // row 57px, so six files cost more vertical space than the entire
      // timeline above them.
      var nameCell = el('div', { 'class': 'uscistr-doc-main' }, [
        el('span', {}, nameChildren),
        shownName ? el('span', { 'class': 'uscistr-doc-name', title: shownName,
          text: middleTruncate(shownName, 30) }) : null
      ]);

      wrap.appendChild(el('div', { 'class': 'uscistr-doc-row' }, [iconWrap, nameCell, meta]));
    }
    wrap.appendChild(el('div', { 'class': 'uscistr-progress-label', text:
      'USCIS lists these files on this case. This panel can see that they exist but cannot open them — download them from my.uscis.gov.' }));
    return { el: wrap, fresh: fresh };
  }

  // Every copy button in the panel. Both of them used to carry their own
  // flash timer, clipboard guard, promise pair and try/catch — four chances
  // each for the two to drift apart on a browser that fails one of them.
  //
  // The clipboard is the only place this tool writes case data outside its own
  // storage, and it is always a deliberate click, never automatic.
  function copyButton(opts) {
    var btn = el('button', {
      'class': opts['class'] || 'uscistr-btn uscistr-btn-sm uscistr-btn-outline',
      type: 'button',
      text: opts.label,
      title: opts.title || null,
      onclick: function () {
        function flash(text) {
          btn.textContent = text;
          setTimeout(function () { btn.textContent = opts.label; }, 1500);
        }
        try {
          if (!navigator.clipboard || !navigator.clipboard.writeText) return flash('Copy failed');
          navigator.clipboard.writeText(opts.getText()).then(
            function () { flash('Copied'); },
            function () { flash('Copy failed'); }
          );
        } catch (e) {
          // Blocked by permissions policy, or a non-secure context.
          flash('Copy failed');
        }
      }
    });
    return btn;
  }

  function buildCopyButton(entry) {
    return copyButton({
      label: 'Copy summary',
      getText: function () { return summaryText(entry); }
    });
  }

  // The five endpoint payloads for a case, labelled. Single source for both
  // the record view and the export, so what a person reads on screen and what
  // they save to a file are provably the same set rather than two lists that
  // drift.
  function caseResponses(entry) {
    var result = entry && entry.result;
    if (!result) return [];
    var out = [];
    for (var i = 0; i < RAW_JSON_SECTIONS.length; i++) {
      var section = RAW_JSON_SECTIONS[i];
      var data = result[section.key];
      if (data === null || data === undefined) continue;
      out.push({ key: section.key, label: section.label, path: section.path, data: data });
    }
    return out;
  }

  var RAW_JSON_SECTIONS = [
    // Named for what each endpoint returns, with the path underneath. The
    // labels used to be paths alone, containing a literal `{n}` — which to
    // anyone not reading it as a URL template is indistinguishable from a
    // placeholder the panel failed to fill in.
    { key: 'caseDetail', label: 'Case detail', path: '/api/cases/…' },
    { key: 'caseStatus', label: 'Status and history', path: '/api/case_status/…' },
    { key: 'documents', label: 'Documents', path: '/api/cases/…/documents' },
    { key: 'processingTimes', label: 'Processing times', path: '/processing_times/…' },
    { key: 'location', label: 'Office', path: '/receipt_info/…' }
  ];

  // Five always-visible endpoint rows, each with its own HTTP badge, sat at the
  // bottom of every card. On a failed check that was five red badges per case —
  // twenty of them beside someone's immigration case, by default, with no
  // interaction. The raw data is the audit trail and stays reachable; it is not
  // something anyone needs to walk past to read their status.
  function buildRawJson(entry) {
    var body = buildRawJsonBody(entry);
    if (!body.rows) return el('span');

    var wrap = el('div', { 'class': 'uscistr-raw-wrap' });
    var label = 'Everything USCIS sent · ' + plural(body.rows, 'response');
    if (body.failed) label += ' · ' + body.failed + " couldn't be read";

    var rawOpen = !!caseUi(entry).showRawJson;
    var chevron = buildIcon('chevron');
    var toggle = el('button', {
      'class': 'uscistr-raw-toggle', type: 'button',
      'aria-expanded': rawOpen ? 'true' : 'false',
      'data-focus-key': 'raw:' + entry.number,
      onclick: function () { caseUi(entry).showRawJson = !rawOpen; render(); }
    });
    if (rawOpen) body.el.removeAttribute('hidden');
    toggle.appendChild(chevron || el('span'));
    toggle.appendChild(el('span', { text: label }));

    linkDisclosure(toggle, body.el);


    wrap.appendChild(toggle);
    wrap.appendChild(body.el);
    return wrap;
  }

  // A field name as a person reads it, derived mechanically rather than from a
  // lookup table: submissionTimestamp -> "Submission timestamp". No dictionary
  // exists on purpose (docs/design/05-record-view.md) — a hand-maintained map
  // renames USCIS's fields and falls behind the API. This falls behind
  // nothing, because it enumerates whatever arrived.
  function humanizeFieldKey(key) {
    var text = String(key)
      .replace(/[_-]+/g, ' ')
      // camelCase and acronym runs: "isPremiumProcessed" -> "is Premium
      // Processed", "letterID" -> "letter ID".
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .trim();
    if (!text) return String(key);
    // Sentence case, not Title Case: these are arbitrary field names, and
    // capitalising every word makes a list of them read like headlines. An
    // all-caps word is left alone — it is an acronym (ID, USCIS, DOB), and
    // lowercasing it would be a different word.
    var words = text.split(/\s+/);
    for (var i = 0; i < words.length; i++) {
      if (!(words[i].length > 1 && words[i] === words[i].toUpperCase())) {
        words[i] = words[i].toLowerCase();
      }
    }
    text = words.join(' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  // How deep the walker will render before it stops. USCIS's payloads nest
  // three or four levels; anything past this is either a shape nobody has seen
  // or a hostile one, and the row says so rather than truncating in silence.
  var RECORD_MAX_DEPTH = 8;

  // Render one value. Scalars become a label/value row; objects and arrays
  // recurse. Everything lands as text nodes — USCIS's statusText genuinely
  // contains HTML anchors, and this view must never be the place that renders
  // them.
  //
  // A present-but-null field gets a row saying so: USCIS sent the field and
  // left it empty, which is different from not sending it at all, and the
  // panel refuses to collapse those two anywhere else either.
  function buildRecordValue(key, value, depth) {
    var row;
    if (depth > RECORD_MAX_DEPTH) {
      row = el('div', { 'class': 'uscistr-rec-row' }, [
        el('span', { 'class': 'uscistr-rec-key', text: humanizeFieldKey(key) }),
        el('span', { 'class': 'uscistr-rec-val uscistr-is-quiet',
          text: 'nested deeper than this view shows — use Show as JSON' })
      ]);
      return row;
    }

    if (Array.isArray(value)) {
      // The count is information before you expand: "Events (0)" means USCIS
      // sent an empty list; no Events row at all means they did not send the
      // field.
      return buildRecordGroup(humanizeFieldKey(key) + ' (' + value.length + ')',
        value, depth, true);
    }
    if (value !== null && typeof value === 'object') {
      return buildRecordGroup(humanizeFieldKey(key), value, depth, false);
    }

    var shown;
    if (value === null) shown = '—';
    else if (value === '') shown = '(empty)';
    else shown = String(redactFieldValue(key, value));
    row = el('div', { 'class': 'uscistr-rec-row' }, [
      el('span', { 'class': 'uscistr-rec-key', text: humanizeFieldKey(key) }),
      el('span', {
        'class': 'uscistr-rec-val' + (value === null || value === '' ? ' uscistr-is-quiet' : ''),
        text: shown
      })
    ]);
    return row;
  }

  // A collapsible object or array. Collapsing is the one structural liberty
  // this view takes, and it takes it because it imposes nothing on the data —
  // it manages length. Contents render on first open.
  function buildRecordGroup(label, value, depth, isArray) {
    var body = el('div', { 'class': 'uscistr-rec-group-body', hidden: 'hidden' });
    var toggle = el('button', {
      'class': 'uscistr-rec-group', type: 'button', 'aria-expanded': 'false',
      onclick: function (e) {
        var button = e.currentTarget;
        var open = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', open ? 'false' : 'true');
        if (open) { body.setAttribute('hidden', 'hidden'); return; }
        if (!body.childNodes.length) fillRecordGroup(body, value, depth, isArray);
        body.removeAttribute('hidden');
      }
    });
    var chevron = buildIcon('chevron');
    toggle.appendChild(chevron || el('span'));
    toggle.appendChild(el('span', { 'class': 'uscistr-rec-key', text: label }));
    linkDisclosure(toggle, body);
    return el('div', { 'class': 'uscistr-rec-group-wrap' }, [toggle, body]);
  }

  function fillRecordGroup(body, value, depth, isArray) {
    var i;
    if (isArray) {
      if (!value.length) {
        body.appendChild(el('div', { 'class': 'uscistr-rec-row uscistr-is-quiet',
          text: 'USCIS sent this list with nothing in it.' }));
        return;
      }
      for (i = 0; i < value.length; i++) {
        // Array entries are numbered from 1: this is a record for a person,
        // not an index into an array.
        body.appendChild(buildRecordValue('#' + (i + 1), value[i], depth + 1));
      }
      return;
    }
    var keys = objectKeys(value);
    if (!keys.length) {
      body.appendChild(el('div', { 'class': 'uscistr-rec-row uscistr-is-quiet',
        text: 'USCIS sent this with nothing in it.' }));
      return;
    }
    for (i = 0; i < keys.length; i++) {
      body.appendChild(buildRecordValue(keys[i], value[keys[i]], depth + 1));
    }
  }

  // Own enumerable keys, in the order the response supplied them. Response
  // order is deliberate: reordering would impose our judgement about what
  // matters in the one view whose purpose is showing the data unreshaped.
  function objectKeys(obj) {
    var out = [];
    for (var k in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, k)) out.push(k);
    }
    return out;
  }

  // The keys a reader should see, which is not the same as the keys present.
  // `__empty`, `__error` and `__auth` are this panel's own markers, written by
  // the fetch layer onto a payload USCIS never sent — so listing them renders
  // a field called "Empty" with the value "true" in a view whose whole claim
  // is that it shows the agency's data unreshaped. The status chip beside the
  // section already states the same fact honestly, in the panel's own voice.
  function responseKeys(obj) {
    var all = objectKeys(obj);
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (String(all[i]).indexOf('__') !== 0) out.push(all[i]);
    }
    return out;
  }

  // The readable rendering of one endpoint payload.
  function buildRecordFields(data) {
    var wrap = el('div', { 'class': 'uscistr-rec-fields' });
    // The envelope is always {"data": …}; unwrap it so the reader sees the
    // case, not our transport.
    var body = (data && typeof data === 'object' && 'data' in data) ? data.data : data;
    if (body === null || body === undefined) {
      wrap.appendChild(el('div', { 'class': 'uscistr-rec-row uscistr-is-quiet',
        text: 'USCIS answered with no content for this one.' }));
      return wrap;
    }
    if (typeof body !== 'object') {
      wrap.appendChild(buildRecordValue('Value', body, 0));
      return wrap;
    }
    if (Array.isArray(body)) {
      fillRecordGroup(wrap, body, 0, true);
      return wrap;
    }
    var keys = responseKeys(body);
    if (!keys.length) {
      wrap.appendChild(el('div', { 'class': 'uscistr-rec-row uscistr-is-quiet',
        text: 'USCIS answered with no content for this one.' }));
      return wrap;
    }
    for (var i = 0; i < keys.length; i++) {
      wrap.appendChild(buildRecordValue(keys[i], body[keys[i]], 0));
    }
    return wrap;
  }

  function buildRawJsonBody(entry) {
    var wrap = el('div', { 'class': 'uscistr-raw-list', hidden: 'hidden' });
    var sections = caseResponses(entry);
    var rows = 0;
    var failed = 0;
    for (var i = 0; i < sections.length; i++) {
      var section = sections[i];
      var data = section.data;
      rows++;

      var status = payloadStatus(data);
      if (payloadFailed(data)) failed++;
      // The section body: a readable field list, with the exact bytes one
      // level deeper for anyone who wants them. Both render lazily on first
      // open — five payloads' worth of DOM on every render is a cost nobody
      // asked for.
      var sectionBody = el('div', { 'class': 'uscistr-rec-section', hidden: 'hidden' });
      var chevron = buildIcon('chevron');

      var summary = el('button', {
        'class': 'uscistr-raw-summary', type: 'button', 'aria-expanded': 'false',
        onclick: (function (bodyEl, dataVal) {
          return function (e) {
            var button = e.currentTarget;
            var open = button.getAttribute('aria-expanded') === 'true';
            button.setAttribute('aria-expanded', open ? 'false' : 'true');
            if (open) {
              bodyEl.setAttribute('hidden', 'hidden');
              return;
            }
            if (!bodyEl.childNodes.length) {
              bodyEl.appendChild(buildRecordFields(dataVal));
              bodyEl.appendChild(buildRecordJsonToggle(dataVal));
            }
            bodyEl.removeAttribute('hidden');
          };
        })(sectionBody, data)
      });
      summary.appendChild(chevron || el('span'));
      summary.appendChild(el('span', { 'class': 'uscistr-raw-name', text: section.label }));
      summary.appendChild(el('span', { 'class': 'uscistr-raw-path', text: section.path }));
      summary.appendChild(chip(status.text, status.variant));
      // The visible label is a URL path; say what it is out loud.
      summary.setAttribute('aria-label',
        section.label.toLowerCase() + ' — everything USCIS sent for this one, ' + status.text);
      linkDisclosure(summary, sectionBody);

      wrap.appendChild(summary);
      wrap.appendChild(sectionBody);
    }
    return { el: wrap, rows: rows, failed: failed };
  }

  // The exact bytes, demoted one level below the readable list. Kept because
  // "read it yourself" is the claim this whole project rests on, and because
  // the field list is a rendering — this is the thing it renders.
  function buildRecordJsonToggle(data) {
    var pre = el('pre', { 'class': 'uscistr-raw', hidden: 'hidden' });
    var toggle = el('button', {
      'class': 'uscistr-more', type: 'button', 'aria-expanded': 'false',
      text: 'Show as JSON',
      onclick: function (e) {
        var button = e.currentTarget;
        var open = button.getAttribute('aria-expanded') === 'true';
        button.setAttribute('aria-expanded', open ? 'false' : 'true');
        button.textContent = open ? 'Show as JSON' : 'Hide JSON';
        if (open) { pre.setAttribute('hidden', 'hidden'); return; }
        if (!pre.textContent) pre.textContent = redactRawJson(JSON.stringify(data, null, 2));
        pre.removeAttribute('hidden');
      }
    });
    linkDisclosure(toggle, pre);
    return el('div', { 'class': 'uscistr-rec-json' }, [toggle, pre]);
  }

  function sectionTitle(text, count) {
    return el('div', { 'class': 'uscistr-section-title' }, [
      el('span', { text: text }),
      (count === null || count === undefined) ? null : el('span', { 'class': 'uscistr-section-count', text: '· ' + count })
    ]);
  }

  function buildSkeleton() {
    var wrap = el('div', { 'class': 'uscistr-stack' });
    var widths = ['62%', '38%', '54%'];
    for (var i = 0; i < widths.length; i++) {
      var bar = el('div', { 'class': 'uscistr-skeleton uscistr-skeleton-bar' });
      bar.style.width = widths[i];
      wrap.appendChild(el('div', { 'class': 'uscistr-skeleton-row' }, [
        el('div', { 'class': 'uscistr-skeleton uscistr-skeleton-dot' }),
        bar
      ]));
    }
    return wrap;
  }

  // Any error shown next to an immigration case is read as being ABOUT the
  // case unless explicitly disclaimed. That disclaimer is not optional.
  function buildCaseErrorNote(entry) {
    var result = entry.result;
    var parts = [result.caseDetail, result.caseStatus, result.documents, result.processingTimes, result.location];
    var failures = 0;
    var auth = false;
    var network = false;
    var unreadable = false;
    var i;
    for (i = 0; i < parts.length; i++) {
      if (!payloadFailed(parts[i])) continue;
      failures++;
      if (parts[i].__auth) auth = true;
      if (String(parts[i].__error).indexOf('Network error') === 0) network = true;
      if (String(parts[i].__error).indexOf('not valid JSON') !== -1) unreadable = true;
    }
    // A single quiet failure (usually processing times) is reported by its
    // endpoint chip, not by a banner over the whole card.
    var coreFailed = payloadFailed(result.caseDetail) && payloadFailed(result.caseStatus);
    if (!coreFailed) return null;

    // The panel already carries this message once, above the list. Repeating
    // it verbatim on every card turned one recoverable problem into five
    // identical alarms, which is the shape of a catastrophe rather than of a
    // session timeout.
    if (auth && state.sessionExpired) return null;

    var snapshot = getSnapshot(entry.number);
    var lines = [];
    var title;
    if (auth) {
      title = 'Your USCIS sign-in has timed out.';
      lines.push('Sign in again at my.uscis.gov, then choose Refresh. Your saved cases and history are safe in this browser.');
    } else if (network) {
      title = "Couldn't reach USCIS just now.";
      lines.push('This is a connection problem between your browser and their servers.');
    } else if (unreadable) {
      title = "USCIS's response for this case didn't look like it usually does.";
      lines.push('That usually means they changed something on their end. Check my.uscis.gov directly.');
    } else {
      title = "Couldn't load this case just now.";
      // The panel banner above already says the case is unaffected. This card
      // used to repeat it in rotated word order — "says nothing about the case
      // itself" appeared three times on one screen, in three rewordings, which
      // reads as defensiveness rather than reassurance.
      lines.push('This is about reading the record.');
    }
    if (snapshotHasContent(snapshot) && snapshot.at) {
      lines.push('Last successful check: ' + formatDateFull(snapshot.at) + '.');
    } else {
      lines.push('This tool has no earlier copy of this case to show you.');
    }
    var actions = el('div', { 'class': 'uscistr-banner-actions' }, [
      el('button', {
        'class': 'uscistr-btn uscistr-btn-sm', type: 'button', text: 'Try again',
        onclick: function () { refreshCase(entry.number); }
      })
    ]);
    return banner('danger', 'warning', title, lines, actions);
  }

  // ---- collapse ------------------------------------------------------------
  //
  // Four cases produce roughly six screens of scrolling, and no single card
  // fits a viewport, so the question the panel exists to answer — has anything
  // moved? — needs a scroll to reach. Collapsing every card to a summary row
  // and expanding one turns that into a single glance. The collapsed stack is
  // itself the overview; a separate status board would render the same four
  // fields a second time, and tabs would make "anything new anywhere?" take
  // four clicks.

  // Exactly one case is open at a time, and opening one widens the panel so the
  // open case sits beside the list rather than on top of it.
  //
  // Multiple cards could previously be open at once, which sounded like it
  // supported comparison and did not: an expanded card is around 1,000px in a
  // ~630px window, so the second open card always started a screen and a half
  // below the first. What it actually did was bury the overview — the reason
  // collapse-all exists — under whatever had been opened.
  //
  // Opening a case is a reading state, not a preference, so it lasts as long as
  // the page does and no longer. Persisting it meant a card opened once in
  // March was still open in August, and a case collapsed once stayed a one-line
  // row on the day it was approved.
  function setExpanded(number, isOpen) {
    uiState.openNumber = isOpen ? String(number).toUpperCase() : null;
  }

  function isCardExpanded(entry, ordered) {
    var key = String(entry.number).toUpperCase();
    if (uiState.openNumber !== null) return uiState.openNumber === key;
    // With one case there is nothing to choose between, so opening it saves a
    // pointless click. With more than one, everything collapses: opening one
    // by rule guesses which case the reader came for and pushes the rest below
    // the fold. The collapsed rows carry enough — status, elapsed days, and any
    // deadline — to choose from without opening anything.
    return ordered.length === 1;
  }

  // The case currently open, if it still exists. A case can be removed while
  // open, and a stale number here would widen the panel around nothing.
  function openEntry() {
    if (uiState.openNumber === null) return null;
    for (var i = 0; i < state.cases.length; i++) {
      if (String(state.cases[i].number).toUpperCase() === uiState.openNumber) return state.cases[i];
    }
    uiState.openNumber = null;
    return null;
  }

  // Below this there is not enough room for a rail and a readable card side by
  // side, and a 720px panel would cover the page it floats over.
  var WIDE_MIN_VIEWPORT = 780;

  // Wide mode: a case is open and there is a list worth keeping beside it.
  // A lone case opens wide too — the card is the same height either way — but
  // renders no rail, because a rail of one row is just a wider card.
  //
  // Gated in JavaScript rather than by a media query because the fallback is a
  // different layout, not a narrower one: hiding the rail in CSS would leave a
  // reader on a small screen with an open case, no list, and no way back.
  function isWideMode() {
    if (window.innerWidth < WIDE_MIN_VIEWPORT) return false;
    return !!openEntry() || (state.cases.length === 1 && uiState.openNumber === null);
  }

  // One row: has it changed, what is it, what does it say, how old is that.
  // Never less — this row alone has to answer "anything new?".
  function buildCollapsedCard(entry, view, onToggle) {
    var row = el('button', { 'class': 'uscistr-collapsed', type: 'button', onclick: onToggle,
      'data-focus-key': 'case:' + String(entry.number).toUpperCase() });

    var formType = (view.detail && view.detail.formType) ||
      (view.notice && view.notice.formNumber) || null;
    var name = entry.label || plainFormName(formType) ||
      shortFormTitle(view) || displayNumber(entry.number);
    var closed = !!(view.detail && view.detail.closed === true);
    var spoken = [name];

    // Line 1 — which case, and how long it has been running. Day N stops on a
    // concluded case: a finished I-765 reading "Day 200" and still climbing is
    // indistinguishable from one that has been waiting 200 days.
    var filedMs = (view.detail && view.detail.submissionDate)
      ? parseUscisDate(view.detail.submissionDate) : null;
    var dayText = closed ? 'Closed'
      : (filedMs !== null ? 'Day ' + daysBetween(filedMs, new Date().getTime()) : '');
    if (dayText) spoken.push(closed ? 'Case closed' : dayText);

    row.appendChild(el('div', { 'class': 'uscistr-collapsed-head' }, [
      entry.changedSince ? el('span', { 'class': 'uscistr-collapsed-dot' }) : null,
      formType ? el('span', { 'class': 'uscistr-chip uscistr-mono', text: String(formType) }) : null,
      el('span', { 'class': 'uscistr-collapsed-name uscistr-truncate', text: name }),
      dayText ? el('span', {
        'class': 'uscistr-collapsed-day' + (closed ? ' uscistr-collapsed-day-closed' : ''),
        text: dayText
      }) : null
    ]));

    // Line 2 — USCIS's own status and when it was set, truncated to one line.
    // The full sentence is one click away; this is a scanning surface.
    var statusText = view.notice && view.notice.status ? view.notice.status
      : (view.fromCache ? 'Showing the last saved copy'
        : (view.hasData ? 'No status published yet' : "Couldn't read this case"));
    var statusMs = view.notice && view.notice.actionCodeDate
      ? parseUscisDate(view.notice.actionCodeDate) : null;
    spoken.push(statusText);

    row.appendChild(el('div', { 'class': 'uscistr-collapsed-body' }, [
      el('span', { 'class': 'uscistr-collapsed-status uscistr-truncate', text: statusText }),
      statusMs !== null
        ? el('span', { 'class': 'uscistr-collapsed-age',
            text: relativeDate(new Date(statusMs).toISOString()) })
        : null
    ]));

    // Line 3 — position and place, when the case has data to say so. The
    // stage answers "where is it", the office answers "who has it" — the two
    // facts a scan of the list most wants and neither of which the status
    // sentence reliably carries. Facts only: the stage map's own current or
    // furthest-evidenced step, and USCIS's jurisdiction string.
    if (view.hasData || view.fromCache) {
      var metaParts = [];
      var posText = collapsedStagePosition(entry, view);
      if (posText) metaParts.push(posText);
      var office = view.officeCode || view.office || null;
      if (office) metaParts.push(String(office));
      if (metaParts.length) {
        var metaLine = el('div', { 'class': 'uscistr-collapsed-place uscistr-truncate' });
        for (var mp = 0; mp < metaParts.length; mp++) {
          if (mp > 0) metaLine.appendChild(el('span', { 'class': 'uscistr-subtitle-sep', text: ' · ' }));
          metaLine.appendChild(el('span', { text: metaParts[mp] }));
        }
        row.appendChild(metaLine);
        spoken.push(metaParts.join(', '));
      }
    }

    // Line 4 — only when something is actually being asked of this person.
    // Collapsing every case is only safe if a deadline can never end up hidden
    // behind a click, so this is the one line a row must never omit.
    var demands = collapsedDemands(view);
    if (demands.length) {
      // With three or more, the row states the most consequential one and
      // counts the rest rather than growing without limit.
      var lead = demands[0].text;
      var rest = demands.length - 1;
      var demandText = rest > 0 ? lead + '  +' + rest + ' more' : lead;
      spoken.push(demandText);
      row.appendChild(el('div', { 'class': 'uscistr-collapsed-demand' }, [
        el('span', { 'class': 'uscistr-collapsed-demand-dot' }),
        el('span', { 'class': 'uscistr-truncate', text: demandText })
      ]));
    }

    // A stale row is otherwise byte-identical to a fresh one.
    if (view.fromCache && view.cachedAt) {
      var asOf = 'Last read ' + relativeDate(view.cachedAt);
      spoken.push(asOf);
      row.appendChild(el('div', { 'class': 'uscistr-collapsed-stale', text: asOf }));
    }

    // Both dots are bare spans, so without this a screen reader hears the
    // status prose and nothing about urgency, change, or staleness.
    if (entry.changedSince) spoken.push('changed since you last looked');
    row.setAttribute('aria-label', spoken.join('. ') + '. Open for the full record.');
    return row;
  }

  // The row's one-phrase answer to "where is it": the latest step the case's
  // own record evidences, with its date — or the present position when
  // nothing beyond receipt is evidenced. Never a prediction, never a
  // characterisation; the same stage map the open card draws, reduced to its
  // newest fact.
  function collapsedStagePosition(entry, view) {
    var info = stageInfo(entry, view);
    var now = new Date().getTime();
    var latest = null;
    for (var i = 0; i < info.stages.length; i++) {
      var s = info.stages[i];
      if (s.state !== 'evidenced' || s.type === 'received') continue;
      // Future-dated evidence (an upcoming appointment) belongs to the amber
      // demand line, which already carries it; this line answers where the
      // case IS, not what is coming.
      if (s.at !== null && s.at !== undefined && s.at > now) continue;
      latest = s;   // stages are already in display order; keep the last
    }
    if (latest) {
      return latest.label + (latest.at !== null && latest.at !== undefined
        ? ' · ' + formatDateAs(latest.at, 'day') : '');
    }
    if (!info.closed) return STAGE_TYPE_LABELS.review;
    return null;   // closed with nothing evidenced: the Closed day-chip already says it
  }

  // Falls back to USCIS's own form title when we have no short name for the
  // form. One row reading `IOE0912345678` beside three reading "Green card
  // application" looks like a data failure rather than an uncommon form.
  function shortFormTitle(view) {
    var full = (view.detail && view.detail.formName) ||
      (view.lastKnown && view.lastKnown.formName) || null;
    if (!full) return null;
    full = String(full);
    return full.length > 34 ? full.slice(0, 33).replace(/[\s,]+$/, '') + '…' : full;
  }

  // The one thing that has to survive collapsing: anything with a date
  // attached, or anything USCIS is waiting on. Empty when the case asks
  // nothing of this person.
  //
  // Ordered by consequence, not by date. A request for evidence carries a
  // statutory deadline whose consequence is denial; an appointment can be
  // rescheduled. An earlier version returned only the first match, so a case
  // with both an appointment and an open evidence request showed only the
  // appointment — the less serious of the two.
  function collapsedDemands(view) {
    var out = [];
    if (view.detail && view.detail.actionRequired === true) {
      out.push({ text: 'USCIS is waiting for something from you', at: null });
    }
    if (view.evidenceCount > 0) {
      out.push({ text: plural(view.evidenceCount, 'evidence request') + ' on file', at: null });
    }
    var upcoming = view.upcoming || [];
    for (var i = 0; i < upcoming.length; i++) {
      var appt = upcoming[i];
      var text = appt.label || 'Appointment';
      if (appt.displayAt !== null && appt.displayAt !== undefined) {
        // The absolute date says which day to keep free; the relative one is
        // what makes it read as a deadline rather than a record.
        text += ' · ' + formatDayLabel(appt.displayAt) +
          ' · ' + relativeDate(new Date(appt.displayAt).toISOString());
      }
      out.push({ text: text, at: appt.displayAt || null });
    }
    return out;
  }

  // USCIS's own form names run to eleven words. The short name is what a
  // person calls the thing they filed.
  var PLAIN_FORM_NAMES = {
    'I-485': 'Green card application',
    'I-485J': 'Job-offer confirmation',
    'I-765': 'Work permit',
    'I-131': 'Travel document',
    'I-130': 'Family petition',
    'I-140': 'Employment petition',
    'N-400': 'Naturalization',
    'I-751': 'Removing conditions',
    'I-129': 'Worker petition',
    'I-90': 'Green card renewal'
  };

  function plainFormName(formType) {
    if (!formType) return null;
    return PLAIN_FORM_NAMES[String(formType).toUpperCase()] || null;
  }

  // A case that has been added but not yet read. Loading and never-checked look
  // different on purpose: one is in progress, the other is waiting on a refresh.
  function buildUncheckedCard(entry) {
    var card = el('div', { 'class': 'uscistr-card' });
    card.appendChild(el('div', { 'class': 'uscistr-card-header' }, [
      el('div', { 'class': 'uscistr-card-title' }, [
        el('div', { 'class': 'uscistr-card-eyebrow' }, [
          el('span', { 'class': 'uscistr-card-label',
            text: entry.label || displayNumber(entry.number) })
        ]),
        el('div', { 'class': 'uscistr-card-number uscistr-mono', text: displayNumber(entry.number) })
      ]),
      el('div', { 'class': 'uscistr-card-actions' })
    ]));
    card.appendChild(el('div', { 'class': 'uscistr-muted uscistr-small', text:
      entry.loading ? 'Reading this case from my.uscis.gov. This takes a few seconds.' : 'Not checked yet.' }));
    if (entry.loading) card.appendChild(buildSkeleton());
    return card;
  }

  function buildCollapsedCardShell(entry, view) {
    var card = el('div', {
      'class': 'uscistr-card' + (entry.changedSince ? ' uscistr-is-changed' : '') +
        ' uscistr-is-collapsed'
    });
    card.appendChild(buildCollapsedCard(entry, view, function () {
      setExpanded(entry.number, true);
      render();
    }));
    return card;
  }

  // Modifiers come from structured facts only — a boolean USCIS sent, this
  // tool's own change marker, or a failed read. Never from status prose.
  function expandedCardClasses(entry, view, errorNote) {
    var classes = 'uscistr-card';
    if (entry.changedSince) classes += ' uscistr-is-changed';
    if (view.detail && view.detail.actionRequired) classes += ' uscistr-is-attention';
    if (view.detail && view.detail.closed) classes += ' uscistr-is-closed';
    if (errorNote) classes += ' uscistr-is-error';
    return classes;
  }

  // Three kinds of card, chosen here and built separately: one for a case that
  // has not been read yet, one collapsed row, and the full record. Everything
  // after the dispatch is the full record only.
  function buildCaseCard(entry, ordered) {
    if (!entry.result) return buildUncheckedCard(entry);

    var view = buildCaseView(entry);

    // Collapsed unless the reader opened this one. A collapsed row still
    // answers "has anything changed here?".
    if (ordered && !isCardExpanded(entry, ordered)) {
      return buildCollapsedCardShell(entry, view);
    }

    var errorNote = buildCaseErrorNote(entry);
    var card = el('div', { 'class': expandedCardClasses(entry, view, errorNote) });

    // A · identity and change state first. A returning reader should not have
    // to compare against memory to learn whether anything moved.
    card.appendChild(buildCardHeader(entry, view));

    var changeBand = buildChangeBand(entry);
    if (changeBand) card.appendChild(changeBand);

    // A failed check is reported above the case, never instead of it. When a
    // stored snapshot exists we keep drawing the card from it (marked stale),
    // because someone opening the panel after a session timeout came to see
    // their case — blanking it looks identical to the case disappearing.
    // Only when there is nothing cached does the note stand alone.
    if (errorNote) {
      card.appendChild(errorNote);
      if (!view.fromCache) {
        card.appendChild(buildRawJson(entry));
        return card;
      }
    }

    // B · a live obligation outranks everything else on the card.
    var upcomingBand = buildUpcomingBand(view);
    if (upcomingBand) card.appendChild(upcomingBand);

    var obligation = buildObligationBand(entry, view);
    if (obligation) card.appendChild(obligation);

    var attention = buildAttentionBanner(view);
    if (attention) card.appendChild(attention);

    // C/D · status headline and its age.
    card.appendChild(buildStatusBlock(entry, view));

    var backendNote = buildBackendNote(entry, view);
    if (backendNote) card.appendChild(backendNote);

    // F · elapsed, stage map, quiet meter.
    // Elapsed time and the stage map are derived from the filing date and the
    // codes we already stored, so they stay meaningful when drawn from cache.
    if (view.hasData || view.fromCache) card.appendChild(buildProgressModule(entry, view));

    // H · timeline.
    var timelineSection = el('div', { 'class': 'uscistr-section' }, [
      sectionTitle('Timeline', view.items.length ? view.items.length : null)
    ]);
    timelineSection.appendChild(buildTimeline(entry, view));
    card.appendChild(timelineSection);

    // I · the fields USCIS's own website never shows. Deliberately NOT wrapped
    // in a titled section: it is a four-row label/value table, and a caps
    // heading plus its rule cost more vertical space than the rows do. The
    // labels are the heading.
    var fields = buildFieldRows(entry, view);
    if (fields.childNodes.length) card.appendChild(fields);

    // J · documents. A zero-count section does not render at all.
    var docsSection = buildDocuments(entry, view);
    var docsNoteText = null;
    if (docsSection) {
      card.appendChild(el('div', { 'class': 'uscistr-section' }, [
        sectionTitle('Documents', view.docs.length), docsSection
      ]));
    } else if (view.hasData) {
      docsNoteText = documentsNoteText(entry, view);
    }

    var floorText = null;
    if (!view.hasData) {
      // Every endpoint answered, and every one of them was empty. That is not
      // the same as "there is nothing to find", and it does not get that copy.
      floorText = 'USCIS returned no case data at all on this check, so what is on the record right now is unknown. That sometimes means the receipt number is filed in an older system this tool cannot read. Check my.uscis.gov directly.';
    } else if (view.items.length <= 3 && (!view.docs || !view.docs.length)) {
      // The sparse floor: this converts "the tool found nothing" into "there
      // is nothing to find", which are very different experiences.
      floorText = 'This is everything USCIS publishes for this case right now. USCIS publishes very little while a case is new. Anything they add, this panel will show and record — including backend activity their website does not show.';
    }

    // On a sparse case both of these fire, and two stacked dashed boxes read
    // as two warnings about a case where nothing is wrong. One box with two
    // paragraphs reads as a single considered statement. Both sentences are
    // kept verbatim: "USCIS lists none" and "there is nothing further to find"
    // are different claims and neither may be dropped for the other.
    var notes = noteBox([docsNoteText, floorText]);
    if (notes) card.appendChild(notes);

    // K · freshness, then the three labelled per-case actions.
    //
    // The last successful READ, not the last attempt. Printing the attempt made
    // a card say "Checked just now" underneath a banner explaining that the
    // check had failed and everything shown was the last saved copy — the one
    // false sentence in an otherwise careful failure design.
    var checkedMs = view.checkedAt ? parseUscisDate(view.checkedAt)
      : (view.cachedAt ? parseUscisDate(view.cachedAt) : null);
    var checkedText = checkedMs === null
      ? "Not read successfully yet"
      : (view.checkedAt ? 'Checked ' : 'Last read ') +
        (relativeDate(new Date(checkedMs).toISOString()) || 'just now');

    card.appendChild(el('div', { 'class': 'uscistr-muted uscistr-small', text:
      checkedText + (view.office ? ' · ' + String(view.office) : '') }));

    card.appendChild(el('div', { 'class': 'uscistr-card-footer' }, [
      el('button', {
        'class': 'uscistr-btn uscistr-btn-sm uscistr-btn-outline', type: 'button',
        text: entry.loading ? 'Refreshing…' : 'Refresh', disabled: entry.loading,
        onclick: function () { refreshCase(entry.number); }
      }),
      buildCopyButton(entry),
      el('button', {
        'class': 'uscistr-btn uscistr-btn-sm uscistr-btn-outline', type: 'button', text: 'Print…',
        onclick: function () { uiState.printFor = entry.number; render(); }
      }),
      el('button', {
        'class': 'uscistr-btn uscistr-btn-sm uscistr-btn-danger', type: 'button', text: 'Remove',
        onclick: function () {
          if (!window.confirm('Remove ' + displayNumber(entry.number) + ' from CaseLens?\n\n' +
            'Saved history for this case is deleted from this browser, and the case will stay ' +
            'hidden even though it is still listed on your USCIS account. Adding it again later ' +
            'starts its history over.')) return;
          var idx = state.cases.indexOf(entry);
          if (idx !== -1) state.cases.splice(idx, 1);
          // Remember the removal, or auto-discovery puts the case straight back
          // on the next page load and the button looks broken.
          setDismissed(entry.number, true);
          forgetCase(entry.number);
          persistCases();
          render();
        }
      })
    ]));

    card.appendChild(buildRawJson(entry));
    return card;
  }

  // Cards are otherwise drawn in the order receipt numbers happen to appear on
  // the account page, which put a finished case first and pushed every case
  // whose clock is still running below it. Order by what the reader needs:
  // something is required of you, then something changed, then still-open
  // cases, then concluded ones.
  function caseSortRank(entry) {
    var view = entry.result ? buildCaseView(entry) : null;
    var detail = view ? view.detail : null;

    var hasObligation = !!(view && (view.upcoming.length ||
      (detail && detail.actionRequired === true) || view.evidenceCount > 0));
    if (hasObligation) return 0;
    if (entry.changedSince) return 1;
    if (detail && detail.closed === true) return 3;
    return 2;
  }

  // Within a rank, most recent activity first. The fallback used to be the
  // order receipt numbers happen to appear on the account page, which for
  // someone with a handful of open cases is most of the list and is arbitrary:
  // a case whose status moved yesterday sat below one that had been silent for
  // two months. Ties fall back to page order so the sort is still total.
  function caseActivityMs(entry) {
    var snap = getSnapshot(entry.number);
    if (!snap) return 0;
    var status = snap.statusAt ? parseUscisDate(snap.statusAt) : null;
    var backend = snap.backendAt ? parseUscisDate(snap.backendAt) : null;
    return Math.max(status || 0, backend || 0);
  }

  function casesInReadingOrder() {
    var decorated = [];
    for (var i = 0; i < state.cases.length; i++) {
      decorated.push({
        entry: state.cases[i],
        rank: caseSortRank(state.cases[i]),
        activity: caseActivityMs(state.cases[i]),
        pos: i
      });
    }
    decorated.sort(function (a, b) {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.activity !== b.activity) return b.activity - a.activity;
      return a.pos - b.pos;   // stable: order never shuffles between renders
    });
    var out = [];
    for (var j = 0; j < decorated.length; j++) out.push(decorated[j].entry);
    return out;
  }

  // ---- panel assembly, refresh, render ---------------------------------

  function buildPanel() {
    var wide = isWideMode();
    uiState.renderedWide = wide;
    var open = openEntry();
    var ordered = casesInReadingOrder();
    // The rail only earns its width when there is more than one case to
    // choose between.
    var rail = wide && ordered.length > 1;

    var classes = 'uscistr-panel' + (wide ? ' uscistr-is-wide' : '');
    // The entry animation plays when the panel appears, not every time it is
    // rebuilt. render() replaces the whole element, so this used to re-run on
    // every refresh and every disclosure click — the panel visibly restarting
    // itself while being read.
    if (!uiState.panelMounted) classes += ' uscistr-panel-enter';
    uiState.panelMounted = true;

    var panel = el('div', {
      'class': classes,
      role: 'complementary',
      'aria-label': 'CaseLens — USCIS case tracker'
    });
    positionPanel(panel);

    panel.appendChild(buildHeader());

    // Panel-wide conditions sit above everything, in both layouts: a failed
    // check or a timed-out session is about the whole panel, not one case.
    var notices = el('div', { 'class': 'uscistr-notices' });
    if (state.sessionExpired) notices.appendChild(buildSessionBanner());
    var storageBanner = buildStorageBanner();
    if (storageBanner) notices.appendChild(storageBanner);
    var failureBanner = buildFetchFailureBanner();
    if (failureBanner) notices.appendChild(failureBanner);
    if (notices.childNodes.length) panel.appendChild(notices);

    panel.appendChild(rail ? buildSplitBody(ordered, open) : buildSingleBody(ordered));

    panel.appendChild(buildFooter());
    if (uiState.settingsOpen) panel.appendChild(buildSettingsPopover());

    return panel;
  }

  // Shown once, to someone who has never seen this panel before.
  //
  // Cases are discovered automatically, so the first run produces a populated
  // panel with no explanation of where it came from — a box that appeared on a
  // government website already knowing your receipt numbers. The empty state
  // explains the tool, but that only fires when nothing was found, which is the
  // uncommon path.
  //
  // Dismissed by the reader, and the dismissal is remembered. It says what this
  // is, who made it, and where the data goes, because those are the three
  // questions someone is entitled to have answered before they trust it.
  function buildFirstRunNote() {
    if (state.prefs.seenIntro) return null;
    if (!state.cases.length) return null;   // the empty state already explains

    return el('div', { 'class': 'uscistr-note uscistr-intro' }, [
      el('div', { 'class': 'uscistr-note-title', text: 'This is CaseLens, and it found your cases automatically.' }),
      el('p', { text: 'It is an unofficial, open-source panel — not USCIS. It read the receipt ' +
        'numbers already printed on this page, and asked USCIS for those cases the same way ' +
        'this website does, signed in as you.' }),
      el('p', { text: 'Nothing leaves this browser. There is no account and no server: your cases, ' +
        'their history and your settings are stored on this computer only. You can erase all of ' +
        'it from Settings.' }),
      el('p', { text: 'USCIS and your mailed notices remain the authority on your case.' }),
      el('button', {
        'class': 'uscistr-btn uscistr-btn-sm uscistr-btn-outline', type: 'button', text: 'Got it',
        onclick: function () {
          state.prefs.seenIntro = true;
          persistPrefs();
          render();
        }
      })
    ]);
  }

  // Narrow: one scrolling column. Also the layout for a lone open case, which
  // needs the width but has no list to keep beside it.
  function buildSingleBody(ordered) {
    var body = el('div', { 'class': 'uscistr-body' });
    var intro = buildFirstRunNote();
    if (intro) body.appendChild(intro);
    body.appendChild(buildAddCaseSection());

    if (!ordered.length) {
      body.appendChild(buildEmptyState());
    } else {
      var list = el('div', { 'class': 'uscistr-case-list' });
      for (var i = 0; i < ordered.length; i++) list.appendChild(buildCaseCard(ordered[i], ordered));
      body.appendChild(list);
    }
    // Not while the first-run note is up: it already says "unofficial — not
    // USCIS" in its second line, and the footer says it a third time. Three
    // statements of the same thing in one view reads as anxiety, not candour.
    if (!intro) body.appendChild(buildStandingDisclaimer());
    return body;
  }

  // Wide: every case stays visible in a rail on the left while one is read on
  // the right. Each scrolls independently, so reading a long case never scrolls
  // the overview away — the failure that made opening a case feel like leaving
  // the panel.
  function buildSplitBody(ordered, open) {
    var railList = el('div', { 'class': 'uscistr-rail-list' });
    for (var i = 0; i < ordered.length; i++) {
      var entry = ordered[i];
      var view = buildCaseView(entry);
      var isOpen = open && entry.number === open.number;
      var row = buildCollapsedCard(entry, view, makeRailToggle(entry, isOpen));
      row.className += ' uscistr-rail-row' + (isOpen ? ' uscistr-rail-row-open' : '');
      row.setAttribute('aria-current', isOpen ? 'true' : 'false');
      railList.appendChild(row);
    }

    var railCol = el('div', { 'class': 'uscistr-rail' }, [railList, buildAddCaseSection()]);

    var detail = el('div', { 'class': 'uscistr-detail' });
    var splitIntro = buildFirstRunNote();
    if (splitIntro) detail.appendChild(splitIntro);
    if (open) {
      detail.appendChild(buildCaseCard(open, ordered));
    } else {
      detail.appendChild(buildEmptyState());
    }
    if (!splitIntro) detail.appendChild(buildStandingDisclaimer());

    return el('div', { 'class': 'uscistr-body uscistr-body-split' }, [railCol, detail]);
  }

  // Clicking the open case's own row closes it and returns the panel to the
  // narrow list. Clicking any other row switches to it without a round trip
  // through the collapsed view.
  function makeRailToggle(entry, isOpen) {
    return function () {
      setExpanded(entry.number, !isOpen);
      render();
    };
  }

  // Fetch one case's data and update its entry in place. Safe to call even
  // while a refresh is already in flight for it (no-op in that case).
  function refreshCase(number) {
    var entry = null;
    for (var i = 0; i < state.cases.length; i++) {
      if (state.cases[i].number === number) { entry = state.cases[i]; break; }
    }
    if (!entry || entry.loading) return Promise.resolve();

    // Captured before the fetch so the card can say what changed and when we
    // last looked. applyFetchResult() overwrites both.
    var previousSnapshot = getSnapshot(number);
    var previousHistory = getHistory(number);
    var previousHistoryLength = previousHistory.length;
    var previousNewestAt = previousHistory.length ? previousHistory[0].at : null;

    entry.loading = true;
    render();
    return fetchAllForCase(number).then(function (result) {
      entry.loading = false;
      applyFetchResult(entry, result);
      // Count by comparing against the newest entry we had, not by length.
      // At HISTORY_CAP the array stops growing, so length arithmetic reported
      // zero new changes forever and the card fell back to a vague "something
      // changed" while the marker was still lit.
      var history = getHistory(number);
      var added = countNewHistory(history, previousNewestAt, previousHistoryLength);
      if (added > 0) {
        entry.newChanges = history.slice(0, added);
        entry.lastLookedAt = previousSnapshot ? previousSnapshot.at : null;
        persistCases();
      }
      render();
    });
  }

  // Refresh every tracked case strictly one after another (never in
  // parallel) — the same politeness constraint fetchAllForCase() applies
  // within a single case, just extended across cases.
  // Cases refresh CONCURRENTLY, each case's endpoints still sequential with
  // STAGGER_MS between them. This was a serial chain — four cases took four
  // times as long as one, which on load meant reading a spinner for most of a
  // minute. The account page itself fires its case requests in parallel, the
  // total request count is identical either way, and the per-case stagger
  // still keeps any single case's burst polite. Case starts are offset a beat
  // apart so the first requests don't land as one volley.
  function refreshAll() {
    var waits = [];
    var started = 0;
    for (var i = 0; i < state.cases.length; i++) {
      (function (entry, slot) {
        if (entry.loading) return;
        waits.push(sleep(slot * STAGGER_MS).then(function () {
          return refreshCase(entry.number);
        }));
      })(state.cases[i], started++);
    }
    return Promise.all(waits);
  }

  function restartRefreshTimer() {
    if (refreshTimerId !== null) clearInterval(refreshTimerId);
    refreshTimerId = setInterval(function () {
      if (document.visibilityState === 'visible') refreshAll();
    }, state.prefs.refreshMs);
  }

  // Rebuild the whole pill/panel from current state. Idempotent and cheap
  // enough to call after every mutation rather than hand-patching the DOM;
  // the only piece of UI state NOT derivable from `state`/`prefs` is the
  // add-case form text and the per-card disclosure flags, which live in
  // uiState/on the entry so they survive a rebuild triggered by, say, a
  // background refresh completing.
  function render() {
    if (!ROOT) return;

    // render() rebuilds the panel wholesale — that is deliberate and is what
    // makes the UI easy to reason about. The cost is that scroll position and
    // keyboard focus die with the old DOM, and the background refresh calls
    // this twice per case on a timer, so a reader mid-way down a card gets
    // thrown to the top while reading. Capture both, restore both.
    // Never rebuild the panel mid-drag. render() replaces the element that
    // dragState is holding, so the drag then moves a detached node and
    // onDragEnd measures it at 0,0 — persisting the panel to the top-left
    // corner. A 15-minute background refresh landing while someone is moving
    // the panel is enough to trigger it.
    if (dragState) return;

    // Start every render from real storage. save() already invalidates what it
    // writes, so this is not needed for our own writes — it is here because
    // another tab on my.uscis.gov shares this origin and can write between
    // renders, and one render is the right bound on how stale we may be.
    invalidateReadMemo();
    invalidateCaseViews();

    // Wide mode has two independent scrollers, so capture both by selector
    // rather than assuming one body element.
    var scrolls = captureScrolls();
    var focusKey = focusKeyFor(document.activeElement);

    renderInto();

    restoreScrolls(scrolls);
    if (focusKey) restoreFocus(focusKey);
    reclampPanel();
  }

  var SCROLLERS = ['.uscistr-body', '.uscistr-rail', '.uscistr-detail'];

  function captureScrolls() {
    var out = {};
    for (var i = 0; i < SCROLLERS.length; i++) {
      var node = ROOT.querySelector(SCROLLERS[i]);
      if (node && node.scrollTop) out[SCROLLERS[i]] = node.scrollTop;
    }
    return out;
  }

  function restoreScrolls(saved) {
    for (var sel in saved) {
      if (!Object.prototype.hasOwnProperty.call(saved, sel)) continue;
      var node = ROOT.querySelector(sel);
      if (node) node.scrollTop = saved[sel];
    }
  }

  // Find the focused control again after render() rebuilds the panel.
  //
  // This used to match buttons by their visible label — which fails on exactly
  // the controls people use most, because every disclosure changes its own
  // label when clicked: "Explain" becomes "Show less", "Show all (12)" becomes
  // "Show fewer". After the rebuild no button carried the old label, the loop
  // fell through, and focus landed on <body> — ejecting a keyboard user from
  // the panel every time they expanded anything. Inputs were worse: the key was
  // the class name, which both add-case fields share, so the caret could be
  // restored into the wrong box mid-typing.
  //
  // focusKey() stamps a stable identity that does not move when the label does.
  function focusKeyFor(node) {
    if (!node || !ROOT || !ROOT.contains(node)) return null;
    return node.getAttribute('data-focus-key');
  }

  function restoreFocus(key) {
    var node = ROOT.querySelector('[data-focus-key="' + key + '"]');
    if (!node) return;
    try {
      node.focus();
    } catch (e) { /* element may not be focusable after the rebuild */ }
  }

  function renderInto() {
    if (!ROOT) return;
    ROOT.className = 'uscistr-root' + (state.prefs.dark ? ' uscistr-dark' : '');
    clearNode(ROOT);
    ROOT.appendChild(state.prefs.collapsed ? buildPill() : buildPanel());
  }

  // ==========================================================================
  // SECTION 7: Bootstrapping + auth gating
  // ==========================================================================
  // init(): checkAuthenticated() -> if not authed, render NOTHING and stop —
  //   no pill, no injected <style>, no DOM footprint at all. Otherwise
  //   auto-discovery is the primary flow: receipt numbers are read out of the
  //   account page (the case-list endpoint returns an empty array even for
  //   accounts with active cases), merged into state.cases, and refreshed.

  // Add any case found on the page that we aren't already tracking. Returns
  // the receipt numbers added, so callers can decide whether to fetch them.
  // Receipt numbers the user removed, as a lookup. Auto-discovery re-reads the
  // account page every load, so this is what makes Remove stick.
  function loadDismissed() {
    var stored = load(STORAGE_KEYS.dismissed, {});
    return (stored && typeof stored === 'object') ? stored : {};
  }

  // Drop every trace of a case the user removed. The confirm dialog promises
  // the saved history is deleted, so it has to actually go — including the
  // snapshot the change-detector would otherwise diff against later.
  function forgetCase(number) {
    var key = String(number).toUpperCase();

    var snapshots = load(STORAGE_KEYS.snapshots, {});
    if (snapshots[key] || snapshots[number]) {
      delete snapshots[key];
      delete snapshots[number];
      save(STORAGE_KEYS.snapshots, snapshots);
    }

    var history = load(STORAGE_KEYS.history, {});
    if (history[key] || history[number]) {
      delete history[key];
      delete history[number];
      save(STORAGE_KEYS.history, history);
    }

    // Status wording learned from this case records which case it came from,
    // so the receipt number outlived the removal that promised to delete it.
    // The wording itself is kept — it is useful on other cases and says
    // nothing about this one — but it stops naming a case that is gone.
    var dict = loadLearned();
    if (dict && dict.byCode) {
      var touched = false;
      for (var code in dict.byCode) {
        if (!Object.prototype.hasOwnProperty.call(dict.byCode, code)) continue;
        var learned = dict.byCode[code];
        if (!learned || !learned.from) continue;
        if (String(learned.from).toUpperCase() !== key) continue;
        delete learned.from;
        touched = true;
      }
      if (touched) save(STORAGE_KEYS.codeText, dict);
    }

    // Rescue copies written when a stored value could not be parsed. They are
    // never read back and never surfaced, so a user has no way to learn they
    // exist — and the confirm dialog promises this case's saved history is
    // deleted. A copy that survives that promise is the promise being false.
    // Dropped wholesale rather than edited: they exist precisely because their
    // contents could not be parsed, so there is nothing to edit safely.
    try {
      for (var r = 0; r < RESCUE_KEYS.length; r++) {
        var rescue = localStorage.getItem(RESCUE_KEYS[r]);
        if (rescue && rescue.toUpperCase().indexOf(key) !== -1) {
          localStorage.removeItem(RESCUE_KEYS[r]);
        }
      }
    } catch (e) { /* storage unavailable: nothing was written to begin with */ }
  }

  function setDismissed(number, isDismissed) {
    var dismissed = loadDismissed();
    var key = String(number).toUpperCase();
    if (isDismissed) dismissed[key] = new Date().toISOString();
    else delete dismissed[key];
    save(STORAGE_KEYS.dismissed, dismissed);
  }

  function mergeDiscoveredCases() {
    var discovered = discoveredCaseNumbers();
    var dismissed = loadDismissed();
    var addedNumbers = [];

    for (var i = 0; i < discovered.length; i++) {
      var d = discovered[i];
      // Every tracked case costs six requests to USCIS on every refresh, and
      // discovery re-reads the page on each in-app navigation. Without a
      // ceiling, an account page (or a page USCIS later changes the shape of)
      // listing far more receipt numbers than a person actually has would turn
      // into hundreds of requests on a timer. Nobody has more cases than this;
      // anything beyond it can still be added by hand.
      if (state.cases.length >= MAX_TRACKED_CASES) break;
      // The user removed this one. Auto-discovery must not undo that.
      if (dismissed[d.number.toUpperCase()]) continue;
      var exists = false;
      for (var j = 0; j < state.cases.length; j++) {
        if (state.cases[j].number.toUpperCase() === d.number.toUpperCase()) {
          exists = true;
          break;
        }
      }
      if (exists) continue;

      state.cases.push(makeCaseEntry({ number: d.number, label: d.label }));
      addedNumbers.push(d.number);
    }

    if (addedNumbers.length) persistCases();
    return addedNumbers;
  }

  // my.uscis.gov is a single-page app: the case list may not be on screen when
  // we start, and navigating within the account swaps content without a page
  // load. Re-read the page on navigation and for a short while after startup so
  // cases are picked up wherever the user happens to land. Scans are cheap
  // (one text read) and stop once the page settles.
  function watchForNewCases(alreadyAdded) {
    var scansLeft = alreadyAdded.length ? 4 : 8;

    function scan() {
      if (!state.authenticated) return;
      var added = mergeDiscoveredCases();
      if (added.length) {
        render();
        for (var i = 0; i < added.length; i++) refreshCase(added[i]);
      }
    }

    var intervalId = setInterval(function () {
      scansLeft -= 1;
      if (scansLeft <= 0) clearInterval(intervalId);
      scan();
    }, 2000);

    window.addEventListener('popstate', onNavigate);
    window.addEventListener('hashchange', onNavigate);

    // my.uscis.gov is a single-page app, so signing out need not reload the
    // document. Without this the panel stayed on screen after logout, fully
    // populated, on a shared or public computer — the one place the
    // render-nothing-when-signed-out rule matters most, and the one place it
    // was not being re-checked.
    function onNavigate() {
      if (!state.authenticated) return;
      checkAuthenticated().then(function (result) {
        if (result && result.authenticated) return scan();
        signOutLocally();
      });
    }
  }

  // Take the panel down without touching anything saved. The cases stay in
  // storage for the next sign-in; what leaves is what is on screen.
  function signOutLocally() {
    state.authenticated = false;
    if (refreshTimerId !== null) {
      clearInterval(refreshTimerId);
      refreshTimerId = null;
    }
    for (var i = 0; i < state.cases.length; i++) state.cases[i].result = null;
    if (ROOT) clearNode(ROOT);
  }

  function init() {
    checkAuthenticated().then(function (authResult) {
      // Not logged in to my.uscis.gov: render absolutely nothing (no pill,
      // no injected <style>, no DOM footprint) rather than show a broken UI.
      if (!authResult || !authResult.authenticated) return;

      state.authenticated = true;
      loadAll();

      var addedAtStartup = mergeDiscoveredCases();

      injectStyle();

      ROOT = el('div', { 'class': 'uscistr-root' });
      document.body.appendChild(ROOT);
      render();

      document.addEventListener('keydown', function (e) {
        // Match on physical key: on macOS Alt+U produces a dead-key diaeresis
        // ('¨') rather than 'u', so testing e.key made the advertised shortcut
        // silently do nothing there.
        if (!e.altKey || e.ctrlKey || e.metaKey) return;
        if (e.code !== 'KeyU' && e.key !== 'u' && e.key !== 'U') return;

        // Don't steal the keystroke from someone typing a nickname.
        var target = e.target;
        if (target) {
          var tag = (target.tagName || '').toUpperCase();
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
        }

        e.preventDefault();
        state.prefs.collapsed = !state.prefs.collapsed;
        persistPrefs();
        render();
      });

      // A panel dragged to the right of a wide window, or low on a tall one,
      // is off-screen the moment the window narrows or an external monitor is
      // unplugged — and position:fixed means the page cannot be scrolled to
      // reach it. Nothing re-ran the clamp until the next render, which on a
      // quiet case is fifteen minutes away.
      // Re-render only when the layout would actually change; otherwise just
      // re-clamp. Re-rendering on every resize event would rebuild the panel
      // dozens of times during a single window drag.
      //
      // The comparison is against what is currently on screen, not against
      // what this listener last saw. Tracking it in the closure looked
      // equivalent and was not: opening a case widened the panel without the
      // listener knowing, so narrowing the window afterwards compared false to
      // false and left the two-column layout in a window too small for it.
      window.addEventListener('resize', function () {
        if (isWideMode() !== uiState.renderedWide) {
          render();
          return;
        }
        reclampPanel();
      });

      // Escape closes the settings popover. Without this it covers the first
      // card until the user happens to find the same icon again.
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' && e.key !== 'Esc') return;
        if (!uiState.settingsOpen) return;
        uiState.settingsOpen = false;
        render();
        // Put focus back on the control that opened it. Without this, closing
        // by keyboard drops focus to <body> — which puts a keyboard user at the
        // top of the USCIS page, outside the panel they were using.
        var gear = ROOT && ROOT.querySelector('[data-uscistr-settings-toggle]');
        if (gear) { try { gear.focus(); } catch (err) { /* not focusable */ } }
      });

      // So does clicking anywhere outside it.
      document.addEventListener('mousedown', function (e) {
        if (!uiState.settingsOpen || !ROOT) return;
        // The popover's class is uscistr-popover. An earlier version of this
        // handler looked for "uscistr-settings", which matches nothing — so a
        // mousedown inside the popover closed it and re-rendered before the
        // click could land, making every setting unreachable by mouse. Use
        // closest() so a future rename fails loudly rather than silently.
        var target = e.target;
        if (target && target.closest) {
          if (target.closest('.uscistr-popover')) return;
          if (target.closest('[data-uscistr-settings-toggle]')) return;
        }
        uiState.settingsOpen = false;
        render();
      });

      if (state.cases.length > 0) refreshAll();

      restartRefreshTimer();
      watchForNewCases(addedAtStartup);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
