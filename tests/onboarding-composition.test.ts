import { describe, it, expect } from 'vitest';
import { composeLegalMentions, composeBankDetails, type SetupInput } from '@/app/onboarding/compose';

/**
 * The first-run setup writes two fields that end up printed on every document:
 * the legal footer and the payment block. Both are composed from optional
 * answers, so the interesting cases are the empty ones.
 */
const base: SetupInput = {
  fullName: 'Fatou Diarra',
  organizationName: 'Studio Baobab',
  currency: 'XOF',
};

describe('mentions légales', () => {
  it('assemble les réponses dans l’ordre du pied de page', () => {
    expect(
      composeLegalMentions({
        ...base,
        legalForm: 'SARL',
        address: 'Cocody Riviera Golf, Abidjan',
        registration: 'CI-ABJ-2024-B-14208',
        taxId: '2402518 F',
        contactEmail: 'contact@studiobaobab.ci',
        phone: '+225 27 22 45 18 90',
      })
    ).toBe(
      'Studio Baobab SARL — Cocody Riviera Golf, Abidjan — RCCM CI-ABJ-2024-B-14208 — ' +
        'NCC 2402518 F — contact@studiobaobab.ci — +225 27 22 45 18 90'
    );
  });

  it('laisse tomber les champs vides sans laisser de séparateur orphelin', () => {
    expect(composeLegalMentions({ ...base, address: 'Abidjan', phone: '' })).toBe(
      'Studio Baobab — Abidjan'
    );
  });

  it('rend null quand seul le nom est connu — un pied de page réduit au nom n’apprend rien', () => {
    expect(composeLegalMentions(base)).toBeNull();
  });
});

describe('coordonnées de paiement', () => {
  it('ne retient que ce qui est renseigné', () => {
    expect(composeBankDetails({ ...base, bankName: 'Ecobank', mobileMoney: '+225 07 00 12 34 56' })).toEqual({
      Banque: 'Ecobank',
      'Mobile Money': '+225 07 00 12 34 56',
    });
  });

  it('rend null plutôt qu’un objet vide, pour que le gabarit PDF n’affiche pas un bloc sans lignes', () => {
    expect(composeBankDetails(base)).toBeNull();
  });
});
