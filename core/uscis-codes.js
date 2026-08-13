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
