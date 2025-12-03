export function extractDomain(url: string | null | undefined): string | null {
    if (!url) return null;
    try {
        let domain = url.toLowerCase();
        // Remove protocol
        domain = domain.replace(/^(https?:\/\/)?(www\.)?/, '');
        // Remove path/query
        domain = domain.split('/')[0];
        // Remove trailing dot
        domain = domain.replace(/\.$/, '');
        return domain;
    } catch (e) {
        return null;
    }
}

export function generatePermutations(
    firstName: string,
    lastName: string,
    middleName: string | null | undefined,
    domain: string
): { email: string; pattern: string }[] {
    const fn = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ln = lastName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const mn = middleName ? middleName.toLowerCase().replace(/[^a-z0-9]/g, '') : '';

    const fi = fn.charAt(0);
    const li = ln.charAt(0);
    const mi = mn ? mn.charAt(0) : '';

    const perms: { email: string; pattern: string }[] = [];

    // Helper to add if not exists
    const add = (local: string, pattern: string) => {
        const email = `${local}@${domain}`;
        if (!perms.some(p => p.email === email)) {
            perms.push({ email, pattern });
        }
    };

    if (!fn || !ln || !domain) return [];

    // Standard patterns
    add(fn, '{fn}');
    add(ln, '{ln}');
    add(`${fn}${ln}`, '{fn}{ln}');
    add(`${fn}.${ln}`, '{fn}.{ln}');
    add(`${fi}${ln}`, '{fi}{ln}');
    add(`${fi}.${ln}`, '{fi}.{ln}');
    add(`${fn}${li}`, '{fn}{li}');
    add(`${fn}.${li}`, '{fn}.{li}');
    add(`${fi}${li}`, '{fi}{li}');
    add(`${fi}.${li}`, '{fi}.{li}');
    add(`${ln}${fn}`, '{ln}{fn}');
    add(`${ln}.${fn}`, '{ln}.{fn}');
    add(`${ln}${fi}`, '{ln}{fi}');
    add(`${ln}.${fi}`, '{ln}.{fi}');
    add(`${li}${fn}`, '{li}{fn}');
    add(`${li}.${fn}`, '{li}.{fn}');
    add(`${li}${fi}`, '{li}{fi}');
    add(`${li}.${fi}`, '{li}.{fi}');

    // Middle name patterns
    if (mn && mi) {
        add(`${fi}${mi}${ln}`, '{fi}{mi}{ln}');
        add(`${fi}${mi}.${ln}`, '{fi}{mi}.{ln}');
        add(`${fn}${mi}${ln}`, '{fn}{mi}{ln}');
        add(`${fn}.${mi}.${ln}`, '{fn}.{mi}.{ln}');
    }

    return perms;
}
