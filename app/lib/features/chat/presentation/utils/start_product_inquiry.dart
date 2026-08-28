import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../auth/presentation/utils/auth_action_guard.dart';
import '../screens/conversations_screen.dart';

Future<void> startProductInquiry(
  BuildContext context, {
  required String productId,
  required String productName,
}) async {
  final buyer = await requireBuyer(
    context,
    actionLabel: tr('inquiry_action'),
  );
  if (buyer?.organizationId == null || !context.mounted) return;

  final controller = TextEditingController(
    text: tr('inquiry_default_message'),
  );
  final message = await showDialog<String>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text(tr('inquiry_title', namedArgs: {'product': productName})),
      content: TextField(
        controller: controller,
        autofocus: true,
        minLines: 3,
        maxLines: 6,
        maxLength: 3000,
        decoration: InputDecoration(
          labelText: tr('inquiry_hint'),
          alignLabelWithHint: true,
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext),
          child: Text(tr('cancel')),
        ),
        FilledButton.icon(
          onPressed: () {
            final value = controller.text.trim();
            if (value.isNotEmpty) Navigator.pop(dialogContext, value);
          },
          icon: const Icon(Icons.send_rounded),
          label: Text(tr('send')),
        ),
      ],
    ),
  );
  controller.dispose();
  if (message == null || !context.mounted) return;

  try {
    final network = ServiceLocator.network();
    final response = await network.post<Map<String, dynamic>>(
      '/conversations',
      data: {'product_id': productId, 'initial_message': message},
    );
    if (!context.mounted) return;
    final conversation = Map<String, dynamic>.from(
      response['conversation'] as Map,
    );
    final conversationId = (conversation['_id'] ?? conversation['id'])
        .toString();
    await Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => ConversationChatScreen(
          conversationId: conversationId,
          title: tr('inquiry_conversation_title', namedArgs: {'product': productName}),
          currentOrganizationId: buyer!.organizationId!,
        ),
      ),
    );
  } catch (error) {
    if (context.mounted) {
      ErrorHandler.showSecureSnackBar(
        context,
        ErrorHandler.getUserFriendlyMessage(error),
        isError: true,
      );
    }
  }
}
