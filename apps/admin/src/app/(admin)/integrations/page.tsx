export const metadata = { title: 'Integratsiyalar · Super Admin' };

const INTEGRATIONS = [
  { name: 'HEMIS', desc: 'O\'zbekiston oliy ta\'lim tizimi', status: 'planned' },
  { name: 'E-IMZO', desc: 'Elektron raqamli imzo', status: 'planned' },
  { name: 'Payme', desc: 'To\'lov tizimi', status: 'planned' },
  { name: 'Click', desc: 'To\'lov tizimi', status: 'planned' },
  { name: 'Eskiz', desc: 'SMS gateway', status: 'planned' },
  { name: 'OpenAI', desc: 'GPT-4 (chatbot, antiplagiat)', status: 'planned' },
  { name: 'Anthropic', desc: 'Claude API', status: 'planned' },
  { name: 'Keycloak', desc: 'SSO identity', status: 'planned' },
];

export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Integratsiyalar</h1>
        <p className="mt-2 text-muted-foreground">Tashqi xizmatlar va API kalitlar</p>
      </header>

      <div className="grid gap-3 md:grid-cols-2">
        {INTEGRATIONS.map((i) => (
          <div key={i.name} className="rounded-md border bg-white p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{i.name}</p>
                <p className="text-sm text-muted-foreground">{i.desc}</p>
              </div>
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs">{i.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
