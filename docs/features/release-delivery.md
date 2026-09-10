# Release delivery

The panel and kiosk display the version associated with their deployed source commit. Re-running
delivery of that source keeps its release version even when semantic-release has already created
the release commit. A later, unrelated release must not supply the displayed version.

GitHub creates release notes and sends the existing changelog notification to Vakhta Dev only when
a new version is published. A successful announcement is separate from a successful deployment.
This correction adds no employee action and does not change the notification destination.

See [engineering decisions and regression evidence](../engineering/features/release-delivery.md)
and [platform operations](../runbooks/platform-operations.md).
