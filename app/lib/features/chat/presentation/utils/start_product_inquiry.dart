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
    actionLabel: 'إرسال استفسار إلى المورد',
  );
  if (buyer?.organizationId == null || !context.mounted) return;

  final controller = TextEditingController(
    text: 'مرحبًا، أريد معرفة المزيد عن السعر والتوفر ومدة تجهيز هذا المنتج.',
  );
  final message = await showDialog<String>(
    context: context,
    builder: (dialogContext) => AlertDialog(
      title: Text('استفسار عن $productName'),
      content: TextField(
        controller: controller,
        autofocus: true,
        minLines: 3,
        maxLines: 6,
        maxLength: 3000,
        decoration: const InputDecoration(
          labelText: 'اكتب استفسارك',
          alignLabelWithHint: true,
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(dialogContext),
          child: const Text('إلغاء'),
        ),
        FilledButton.icon(
          onPressed: () {
            final value = controller.text.trim();
            if (value.isNotEmpty) Navigator.pop(dialogContext, value);
          },
          icon: const Icon(Icons.send_rounded),
          label: const Text('إرسال'),
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
          title: 'استفسار: $productName',
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
