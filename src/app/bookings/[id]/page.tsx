import BookingDetailView from "@/features/booking/components/booking-detail-view";

export default async function BookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BookingDetailView bookingId={id} />;
}
