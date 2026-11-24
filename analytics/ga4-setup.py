"""
GA4 setup for happysnc.com (G-0NW3LQW56M), run once by someone with Editor access.

What it does (safe to re-run; skips anything that already exists):
  1. Finds the GA4 property that owns G-0NW3LQW56M.
  2. Marks generate_lead, sign_up, call_click and get_directions as key events.
  3. Registers event-scoped custom dimensions: link_location, link_text, section,
     source_page, occasion, category.
  4. Turns off enhanced measurement "form interactions" (it fires on submit, not success).

Setup (once):
  pip install google-analytics-admin
  gcloud auth application-default login \
    --scopes=https://www.googleapis.com/auth/analytics.edit,https://www.googleapis.com/auth/cloud-platform

Run:
  python3 analytics/ga4-setup.py           # shows what it would change
  python3 analytics/ga4-setup.py --apply   # makes the changes
"""
import sys
from google.analytics import admin_v1alpha as admin
from google.protobuf import field_mask_pb2

MEASUREMENT_ID = "G-0NW3LQW56M"
KEY_EVENTS = ["generate_lead", "sign_up", "call_click", "get_directions"]
DIMENSIONS = {
    "link_location": "Link location",
    "link_text": "Link text",
    "section": "Section seen",
    "source_page": "Source page",
    "occasion": "Event occasion",
    "category": "Menu category",
}
APPLY = "--apply" in sys.argv
c = admin.AnalyticsAdminServiceClient()


def find_stream():
    for acct in c.list_account_summaries():
        for prop in acct.property_summaries:
            for s in c.list_data_streams(parent=prop.property):
                if s.web_stream_data and s.web_stream_data.measurement_id == MEASUREMENT_ID:
                    return prop.property, prop.display_name, s.name
    sys.exit(f"No property you can access has the stream {MEASUREMENT_ID}. Check you signed in with the right Google account.")


prop, prop_name, stream = find_stream()
print(f"Property: {prop_name} ({prop}) · stream {stream}\n" + ("APPLYING CHANGES" if APPLY else "DRY RUN (add --apply to change things)") + "\n")

have = {k.event_name for k in c.list_key_events(parent=prop)}
for ev in KEY_EVENTS:
    if ev in have:
        print(f"  key event   {ev}: already set")
    else:
        print(f"  key event   {ev}: {'created' if APPLY else 'would create'}")
        if APPLY:
            c.create_key_event(parent=prop, key_event=admin.KeyEvent(
                event_name=ev, counting_method=admin.KeyEvent.CountingMethod.ONCE_PER_EVENT))

have = {d.parameter_name for d in c.list_custom_dimensions(parent=prop)}
for param, label in DIMENSIONS.items():
    if param in have:
        print(f"  dimension   {param}: already registered")
    else:
        print(f"  dimension   {param} -> '{label}': {'created' if APPLY else 'would create'}")
        if APPLY:
            c.create_custom_dimension(parent=prop, custom_dimension=admin.CustomDimension(
                parameter_name=param, display_name=label,
                scope=admin.CustomDimension.DimensionScope.EVENT))

em = c.get_enhanced_measurement_settings(name=stream + "/enhancedMeasurementSettings")
print(f"\n  enhanced measurement: page views={em.stream_enabled}, scrolls={em.scrolls_enabled}, "
      f"outbound={em.outbound_clicks_enabled}, downloads={em.file_downloads_enabled}, forms={em.form_interactions_enabled}")
if em.form_interactions_enabled:
    print(f"  form interactions: {'turned off' if APPLY else 'would turn off'}")
    if APPLY:
        em.form_interactions_enabled = False
        c.update_enhanced_measurement_settings(enhanced_measurement_settings=em,
                                               update_mask=field_mask_pb2.FieldMask(paths=["form_interactions_enabled"]))

print("\nDone." if APPLY else "\nNothing changed. Re-run with --apply.")
