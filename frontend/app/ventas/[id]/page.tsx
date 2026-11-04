import Titulo from "@/components/Titulo";

export default async function DetalleVenta({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div>
      <Titulo>Venta #{id}</Titulo>
    </div>
  );
}
