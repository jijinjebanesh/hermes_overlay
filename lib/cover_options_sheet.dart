import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

void _showCoverOptionsSheet(BuildContext context, bool hasCustomCover) {
  final colorScheme = Theme.of(context).colorScheme;

  showModalBottomSheet<void>(
    context: context,
    useRootNavigator: true,
    backgroundColor: Colors.transparent,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
    ),
    builder: (sheetContext) => ClipRRect(
      borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: Container(
          color: colorScheme.surface.withValues(alpha: 0.8),
          child: SafeArea(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  margin: const EdgeInsets.only(top: 12),
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: colorScheme.onSurfaceVariant.withValues(alpha: 0.4),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(height: 16),
                ListTile(
                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 24,
                    vertical: 4,
                  ),
                  leading: Container(
                    width: 40,
                    height: 40,
                    decoration: BoxDecoration(
                      color: colorScheme.primaryContainer,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(
                      Icons.image_outlined,
                      color: colorScheme.onPrimaryContainer,
                    ),
                  ),
                  title: Text(context.l10n.collectionPlaylistChangeCover),
                  onTap: () {
                    Navigator.pop(sheetContext);
                    _pickCoverImage();
                  },
                ),
                if (hasCustomCover)
                  ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 24,
                      vertical: 4,
                    ),
                    leading: Container(
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        color: colorScheme.errorContainer,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Icon(
                        Icons.delete_outline,
                        color: colorScheme.onErrorContainer,
                      ),
                    ),
                    title: Text(context.l10n.collectionPlaylistRemoveCover),
                    onTap: () {
                      Navigator.pop(sheetContext);
                      _removeCoverImage();
                    },
                  ),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ),
      ),
    ),
  );
}

class _CollectionTrackTile extends ConsumerWidget {
  final CollectionTrackEntry entry;
  final LibraryTracksFolderMode mode;
  final String? playlistId;
  final List<Track> folderTracks;
  final bool isInHistory;
  final bool isSelectionMode;
  final bool isSelected;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;

  // TODO: Add constructor and build method
}
