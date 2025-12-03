export interface EmailPermutation {
    email: string;
    pattern: string;
}

export function generatePermutations(firstName: string, lastName: string, domain: string): EmailPermutation[] {
    if (!firstName || !lastName || !domain) return [];

    const f = firstName.toLowerCase().trim();
    const l = lastName.toLowerCase().trim();
    const d = domain.toLowerCase().trim();
    const fi = f.charAt(0);
    const li = l.charAt(0);

    // Standard permutations with pattern names
    const perms: EmailPermutation[] = [
        { email: `${f}.${l}@${d}`, pattern: 'firstname.lastname' },
        { email: `${f}@${d}`, pattern: 'firstname' },
        { email: `${f}${l}@${d}`, pattern: 'firstnamelastname' },
        { email: `${fi}${l}@${d}`, pattern: 'firstname.l' },
        { email: `${f}${li}@${d}`, pattern: 'firstnamel' },
        { email: `${l}.${f}@${d}`, pattern: 'lastname.firstname' },
        { email: `${l}@${d}`, pattern: 'lastname' },
        { email: `${l}${f}@${d}`, pattern: 'lastnamefirstname' },
        { email: `${l}${fi}@${d}`, pattern: 'lastname.f' },
        { email: `${li}${f}@${d}`, pattern: 'l.firstname' },
        { email: `${f}_${l}@${d}`, pattern: 'firstname_lastname' },
        { email: `${f}-${l}@${d}`, pattern: 'firstname-lastname' },
    ];

    // Remove duplicates by email
    const uniquePerms = perms.filter((perm, index, self) =>
        index === self.findIndex((p) => p.email === perm.email)
    );

    return uniquePerms;
}
