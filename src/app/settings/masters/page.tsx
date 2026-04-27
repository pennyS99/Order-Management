import { MasterSettingsClient } from "@/components/settings/MasterSettingsClient";
import { readMasters } from "@/lib/mastersStore";

export default async function MasterSettingsPage() {
  const data = await readMasters();
  const items = [...data.items].sort((a, b) => a.item.localeCompare(b.item));
  const addresses = [...data.addresses].sort((a, b) => a.dcName.localeCompare(b.dcName));
  const trucks = [...data.trucks].sort((a, b) => a.truckType.localeCompare(b.truckType));

  return <MasterSettingsClient initialItems={items} initialAddresses={addresses} initialTrucks={trucks} />;
}
