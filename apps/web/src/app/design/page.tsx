'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertTitle,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@restaurant/ui';

/**
 * The design system, rendered.
 *
 * This page exists so a visual direction can be judged against the real thing
 * instead of against a screenshot. Every token the platform defines and every
 * primitive it ships is on this one URL, in both themes — so when a new design
 * arrives, the question "does the system already do this, and what would have
 * to change" has an answer you can look at.
 *
 * It is also the fastest way to catch a token that was renamed in one place and
 * not another: a broken swatch here is a broken button everywhere.
 *
 * Open at /design.
 */
export default function DesignSystemPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-14 px-6 py-12">
      <header>
        <p className="text-muted-foreground text-sm tracking-wide uppercase">
          Smart Restaurant Campus
        </p>
        <h1 className="mt-1 text-4xl font-bold tracking-tight">Dizayn tizimi</h1>
        <p className="text-muted-foreground mt-3 max-w-2xl">
          Platformaning barcha tokenlari va primitivlari. Yangi dizayn shu sahifaga solishtiriladi:
          tizim allaqachon nima qila oladi va nimani o‘zgartirish kerak — javobi shu yerda
          ko‘rinadi.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Badge>@restaurant/ui</Badge>
          <Badge variant="secondary">Tailwind v4</Badge>
          <Badge variant="secondary">shadcn/ui · Radix</Badge>
          <Badge variant="outline">oklch tokens</Badge>
        </div>
      </header>

      <Section
        title="Ranglar"
        note="Semantik nomlar, xom qiymatlar emas. Komponent hech qachon rangni to‘g‘ridan-to‘g‘ri yozmaydi — shuning uchun yangi palitra bu bitta fayldagi o‘nta qiymat, o‘ttizta komponent emas."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {SURFACES.map((token) => (
            <Swatch key={token.name} {...token} />
          ))}
        </div>
      </Section>

      <Section
        title="Diagramma ranglari"
        note="Besh qator, tartibda. Utility sinf orqali — inline style bilan emas: Tailwind v4 hech qanday sinf ishlatmagan token o‘zgaruvchisini umuman chiqarmaydi, shuning uchun var(--color-chart-3) bo‘sh qoladi."
      >
        <div className="grid grid-cols-5 gap-3">
          {CHARTS.map((chart) => (
            <div key={chart.name} className="space-y-2">
              <div className={`h-16 rounded-lg border ${chart.className}`} />
              <p className="text-muted-foreground text-xs">{chart.name}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Radius"
        note="Bitta --radius dan hosil qilinadi, shuning uchun burchaklar butun tizimda birga o‘zgaradi. Sinf nomlari to‘liq yozilgan — `rounded-${size}` kabi yig‘ma nom Tailwind skaneriga ko‘rinmaydi."
      >
        <div className="flex flex-wrap items-end gap-4">
          {RADII.map((radius) => (
            <div key={radius.name} className="space-y-2 text-center">
              <div className={`bg-secondary h-20 w-20 border ${radius.className}`} />
              <p className="text-muted-foreground text-xs">{radius.name}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Tipografika">
        <div className="space-y-3">
          <p className="text-4xl font-bold tracking-tight">Osh Markazi — bugungi tushum</p>
          <p className="text-2xl font-semibold">Bo‘lim sarlavhasi</p>
          <p className="text-base">
            Asosiy matn. Restoran, kafe, bar va fast food shaxobchalari uchun yagona raqamli
            platforma.
          </p>
          <p className="text-muted-foreground text-sm">
            Ikkilamchi matn — izoh, tavsif, yordamchi ma‘lumot.
          </p>
          <p className="font-mono text-sm">OSH-001 · 45 000 so‘m · tabular</p>
        </div>
      </Section>

      <Section title="Tugmalar">
        <div className="flex flex-wrap gap-3">
          <Button>Saqlash</Button>
          <Button variant="secondary">Ikkilamchi</Button>
          <Button variant="outline">Kontur</Button>
          <Button variant="ghost">Shaffof</Button>
          <Button variant="link">Havola</Button>
          <Button variant="destructive">O‘chirish</Button>
          <Button disabled>Faol emas</Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button size="sm">Kichik</Button>
          <Button>Standart</Button>
          <Button size="lg">Katta</Button>
        </div>
      </Section>

      <Section title="Nishonlar">
        <div className="flex flex-wrap gap-2">
          <Badge>Faol</Badge>
          <Badge variant="secondary">Qoralama</Badge>
          <Badge variant="outline">Arxiv</Badge>
          <Badge variant="destructive">Stop-list</Badge>
        </div>
      </Section>

      <Section title="Kartalar">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Bugungi tushum</CardTitle>
              <CardDescription>Zal, olib ketish va yetkazib berish</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">4 250 000</p>
              <p className="text-muted-foreground mt-1 text-sm">so‘m · 148 chek</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>O‘rtacha chek</CardTitle>
              <CardDescription>Kecha bilan solishtirganda</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">28 700</p>
              <p className="text-chart-2 mt-1 text-sm">+6,2%</p>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Ogohlantirishlar">
        <div className="space-y-3">
          <Alert>
            <AlertTitle>Smena ochilmagan</AlertTitle>
            <AlertDescription>Sotuvni boshlashdan oldin kassa smenasini oching.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertTitle>Kassada farq bor</AlertTitle>
            <AlertDescription>Sanalgan naqd kutilgan summadan 29 000 so‘mga kam.</AlertDescription>
          </Alert>
        </div>
      </Section>

      <Section title="Forma elementlari">
        <div className="grid max-w-md gap-4">
          <div className="grid gap-2">
            <Label htmlFor="dish">Taom nomi</Label>
            <Input id="dish" placeholder="Osh" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="note">Izoh</Label>
            <Textarea id="note" placeholder="Oshxona uchun izoh" />
          </div>
          <div className="flex items-center gap-3">
            <Checkbox id="halal" defaultChecked />
            <Label htmlFor="halal">Halol</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch id="available" defaultChecked />
            <Label htmlFor="available">Sotuvda</Label>
          </div>
        </div>
      </Section>

      <Section title="Jadval">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Taom</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Narx</TableHead>
              <TableHead>Holat</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DISHES.map((dish) => (
              <TableRow key={dish.sku}>
                <TableCell className="font-medium">{dish.name}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-sm">
                  {dish.sku}
                </TableCell>
                <TableCell className="text-right tabular-nums">{dish.price}</TableCell>
                <TableCell>
                  <Badge variant={dish.stopped ? 'destructive' : 'secondary'}>
                    {dish.stopped ? 'Stop-list' : 'Sotuvda'}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section title="Ichki navigatsiya">
        <Tabs defaultValue="menu">
          <TabsList>
            <TabsTrigger value="menu">Menyu</TabsTrigger>
            <TabsTrigger value="orders">Buyurtmalar</TabsTrigger>
            <TabsTrigger value="kitchen">Oshxona</TabsTrigger>
          </TabsList>
          <TabsContent value="menu" className="text-muted-foreground pt-4">
            Kategoriyalar, taomlar, narxlar va stop-list.
          </TabsContent>
          <TabsContent value="orders" className="text-muted-foreground pt-4">
            Zal, olib ketish, yetkazib berish va agregator buyurtmalari.
          </TabsContent>
          <TabsContent value="kitchen" className="text-muted-foreground pt-4">
            Sexlar bo‘yicha chiptalar va tayyorlash vaqti.
          </TabsContent>
        </Tabs>
      </Section>

      <Section
        title="Tanlov elementlari"
        note="Bittasini tanlash — radio, ro‘yxatdan tanlash — select. Ikkalasi ham klaviatura bilan to‘liq boshqariladi."
      >
        <div className="grid max-w-md gap-6">
          <div className="grid gap-3">
            <Label>Buyurtma kanali</Label>
            <RadioGroup defaultValue="dine_in">
              {CHANNELS.map((channel) => (
                <div key={channel.value} className="flex items-center gap-3">
                  <RadioGroupItem value={channel.value} id={channel.value} />
                  <Label htmlFor={channel.value} className="font-normal">
                    {channel.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="station">Sex</Label>
            <Select defaultValue="hot">
              <SelectTrigger id="station" className="w-full">
                <SelectValue placeholder="Sexni tanlang" />
              </SelectTrigger>
              <SelectContent>
                {STATIONS.map((station) => (
                  <SelectItem key={station.value} value={station.value}>
                    {station.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Section>

      <Section
        title="Tekshiriladigan forma"
        note="Form + react-hook-form + zod. Xato holati komponentning o‘zidan keladi — sahifa uni qo‘lda chizmaydi, shuning uchun barcha formalar bir xil xato ko‘rinishiga ega."
      >
        <StopListForm />
      </Section>

      <Section
        title="Qatlamlar"
        note="Uchta modal yuza, uch xil maqsad: dialog — qisqa amal, alert-dialog — qaytarib bo‘lmaydigan amal (tasdiqsiz yopilmaydi), sheet — yon panel."
      >
        <div className="flex flex-wrap gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Taom qo‘shish</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Yangi taom</DialogTitle>
                <DialogDescription>
                  Nom va narx — qolganini keyin ham to‘ldirish mumkin.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-2">
                <div className="grid gap-2">
                  <Label htmlFor="new-dish">Nomi</Label>
                  <Input id="new-dish" placeholder="Norin" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="new-price">Narxi (so‘m)</Label>
                  <Input id="new-price" inputMode="numeric" placeholder="38 000" />
                </div>
              </div>
              <DialogFooter>
                <Button>Saqlash</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">Smenani yopish</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Smena yopilsinmi?</AlertDialogTitle>
                <AlertDialogDescription>
                  Yopilgandan keyin bu smenaga chek qo‘shib bo‘lmaydi va Z-hisobot chiqadi.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
                <AlertDialogAction>Ha, yopilsin</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="secondary">Chek tafsiloti</Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Chek № 1042</SheetTitle>
                <SheetDescription>Stol 7 · Malika Tosheva · 21:14</SheetDescription>
              </SheetHeader>
              <div className="space-y-3 px-4">
                {DISHES.map((dish) => (
                  <div key={dish.sku} className="flex justify-between text-sm">
                    <span>{dish.name}</span>
                    <span className="tabular-nums">{dish.price}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between font-medium">
                  <span>Jami</span>
                  <span className="tabular-nums">95 000</span>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </Section>

      <Section
        title="Suzuvchi qatlamlar"
        note="Dropdown — amallar ro‘yxati, popover — erkin mazmun, tooltip — faqat izoh (hech qachon yagona ma’lumot manbai emas: kassada sichqoncha yo‘q)."
      >
        <div className="flex flex-wrap items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Amallar</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Taom</DropdownMenuLabel>
              <DropdownMenuItem>Tahrirlash</DropdownMenuItem>
              <DropdownMenuItem>Nusxalash</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">Stop-listga qo‘yish</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline">Tannarx</Button>
            </PopoverTrigger>
            <PopoverContent className="w-72">
              <p className="text-sm font-medium">Osh — tannarx tarkibi</p>
              <div className="text-muted-foreground mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>Guruch 200 g</span>
                  <span className="tabular-nums">4 800</span>
                </div>
                <div className="flex justify-between">
                  <span>Qo‘y go‘shti 150 g</span>
                  <span className="tabular-nums">12 000</span>
                </div>
                <div className="flex justify-between">
                  <span>Sabzi, yog‘, ziravor</span>
                  <span className="tabular-nums">2 400</span>
                </div>
              </div>
              <Separator className="my-3" />
              <div className="flex justify-between text-sm font-medium">
                <span>Food cost</span>
                <span className="tabular-nums">42,7%</span>
              </div>
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost">Nima uchun qizil?</Button>
            </TooltipTrigger>
            <TooltipContent>Food cost 40% dan oshgan</TooltipContent>
          </Tooltip>
        </div>
      </Section>

      <Section
        title="Buyruq paneli"
        note="Ctrl/⌘ + K. Ofitsiant menyuni sichqoncha bilan emas, yozib topadi — bu ekran uzun menyularda eng tez yo‘l."
      >
        <Command className="max-w-md rounded-lg border">
          <CommandInput placeholder="Taom yoki buyruq qidiring..." />
          <CommandList>
            <CommandEmpty>Hech narsa topilmadi.</CommandEmpty>
            <CommandGroup heading="Taomlar">
              {DISHES.map((dish) => (
                <CommandItem key={dish.sku}>
                  <span>{dish.name}</span>
                  <span className="text-muted-foreground ml-auto tabular-nums">{dish.price}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandGroup heading="Amallar">
              <CommandItem>Yangi buyurtma</CommandItem>
              <CommandItem>Smenani yopish</CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </Section>

      <Section
        title="Yig‘iladigan bo‘limlar"
        note="Uzun formalarni bosqichga bo‘lish uchun. Bir vaqtda bittasi ochiq — shuning uchun ekran hech qachon uzayib ketmaydi."
      >
        <Accordion type="single" collapsible className="max-w-xl">
          <AccordionItem value="general">
            <AccordionTrigger>Asosiy ma‘lumot</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Nomi, kategoriyasi, tavsifi va rasmi — uchala tilda.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="price">
            <AccordionTrigger>Narx va kanallar</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Zal, olib ketish, yetkazib berish va agregator uchun alohida narx.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="tech">
            <AccordionTrigger>Texnologik karta</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              Ingredientlar va sarf — tannarx shundan hisoblanadi.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </Section>

      <Section
        title="Bildirishnomalar"
        note="Toaster ilovaning ildizida bir marta ulanadi; sahifa faqat toast() chaqiradi."
      >
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => toast.success('Taom saqlandi')}>
            Muvaffaqiyat
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast.error('Kassada farq bor', { description: '29 000 so‘m yetishmaydi' })
            }
          >
            Xato
          </Button>
          <Button variant="outline" onClick={() => toast('Smena 21:00 da yopiladi')}>
            Oddiy
          </Button>
        </div>
      </Section>

      <Section title="Qolganlari">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback>MT</AvatarFallback>
            </Avatar>
            <div className="text-sm">
              <p className="font-medium">Malika Tosheva</p>
              <p className="text-muted-foreground">Kassir</p>
            </div>
          </div>

          <Separator orientation="vertical" className="h-10" />

          <div className="w-56 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      </Section>
    </div>
  );
}

/**
 * The Form primitive, shown doing its actual job.
 *
 * A form is the one primitive that cannot be demonstrated statically: what
 * distinguishes it from a pile of inputs is where the error text comes from and
 * how it is wired to the field for a screen reader. Submitting this with an
 * empty reason is the point of the section.
 */
const stopListSchema = z.object({
  dish: z.string().min(1, 'Taomni tanlang'),
  reason: z.string().min(5, 'Sabab kamida 5 ta belgi bo‘lsin'),
});

function StopListForm() {
  const form = useForm<z.infer<typeof stopListSchema>>({
    resolver: zodResolver(stopListSchema),
    defaultValues: { dish: 'Norin', reason: '' },
  });

  return (
    <Form {...form}>
      <form
        className="grid max-w-md gap-4"
        onSubmit={form.handleSubmit((values) =>
          toast.success(`${values.dish} stop-listga qo‘yildi`, { description: values.reason }),
        )}
      >
        <FormField
          control={form.control}
          name="dish"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Taom</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="reason"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Sabab</FormLabel>
              <FormControl>
                <Textarea placeholder="Masalan: go‘sht tugadi" {...field} />
              </FormControl>
              <FormDescription>Oshxona va ofitsiantlar shu sababni ko‘radi.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div>
          <Button type="submit">Stop-listga qo‘yish</Button>
        </div>
      </form>
    </Form>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {note ? <p className="text-muted-foreground mt-1 mb-5 max-w-2xl text-sm">{note}</p> : null}
      <div className={note ? '' : 'mt-5'}>{children}</div>
    </section>
  );
}

function Swatch({ name, className, note }: { name: string; className: string; note?: string }) {
  return (
    <div className="space-y-2">
      <div className={`h-16 rounded-lg border ${className}`} />
      <div>
        <p className="font-mono text-xs">{name}</p>
        {note ? <p className="text-muted-foreground text-xs">{note}</p> : null}
      </div>
    </div>
  );
}

const SURFACES = [
  { name: 'background', className: 'bg-background' },
  { name: 'foreground', className: 'bg-foreground' },
  { name: 'card', className: 'bg-card' },
  { name: 'popover', className: 'bg-popover' },
  { name: 'primary', className: 'bg-primary', note: 'brend' },
  { name: 'secondary', className: 'bg-secondary' },
  { name: 'muted', className: 'bg-muted' },
  { name: 'accent', className: 'bg-accent' },
  { name: 'destructive', className: 'bg-destructive', note: 'faqat buzuvchi amal' },
  { name: 'border', className: 'bg-border' },
  { name: 'input', className: 'bg-input' },
  { name: 'ring', className: 'bg-ring', note: 'fokus' },
  { name: 'sidebar', className: 'bg-sidebar' },
  { name: 'sidebar-primary', className: 'bg-sidebar-primary' },
  { name: 'sidebar-accent', className: 'bg-sidebar-accent' },
  { name: 'sidebar-border', className: 'bg-sidebar-border' },
];

/**
 * Written out in full, never assembled.
 *
 * Tailwind finds classes by reading source text, so `bg-chart-${n}` produces
 * nothing at all — and a token that no utility references is not even emitted
 * as a CSS variable, which is why an inline `var(--color-chart-3)` renders
 * transparent while `var(--color-chart-2)` works purely because some card
 * elsewhere happened to use it.
 */
const CHARTS = [
  { name: 'chart-1', className: 'bg-chart-1' },
  { name: 'chart-2', className: 'bg-chart-2' },
  { name: 'chart-3', className: 'bg-chart-3' },
  { name: 'chart-4', className: 'bg-chart-4' },
  { name: 'chart-5', className: 'bg-chart-5' },
];

const RADII = [
  { name: 'radius-sm', className: 'rounded-sm' },
  { name: 'radius-md', className: 'rounded-md' },
  { name: 'radius-lg', className: 'rounded-lg' },
  { name: 'radius-xl', className: 'rounded-xl' },
];

const DISHES = [
  { name: 'Osh', sku: 'OSH-001', price: '45 000', stopped: false },
  { name: 'Somsa', sku: 'SOM-004', price: '12 000', stopped: false },
  { name: 'Norin', sku: 'NOR-002', price: '38 000', stopped: true },
];

/** Mirrors SALES_CHANNELS in @/lib/constants, which mirrors the API. */
const CHANNELS = [
  { value: 'dine_in', label: 'Zalda' },
  { value: 'takeaway', label: 'Olib ketish' },
  { value: 'delivery', label: 'Yetkazib berish' },
  { value: 'aggregator', label: 'Agregator' },
];

/** Mirrors KITCHEN_STATIONS in @/lib/constants. */
const STATIONS = [
  { value: 'hot', label: 'Issiq sex' },
  { value: 'cold', label: 'Sovuq sex' },
  { value: 'grill', label: 'Grill' },
  { value: 'bar', label: 'Bar' },
  { value: 'pastry', label: 'Qandolat' },
];
