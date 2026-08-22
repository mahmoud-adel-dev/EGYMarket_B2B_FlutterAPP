import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../core/di/service_locator.dart';
import '../../../../core/errors/error_handler.dart';
import '../../../../core/network/network_manager.dart';
import '../../../../core/theme/app_theme.dart';
import '../../chat_models.dart';

class ConversationsScreen extends StatefulWidget {
  final String currentOrganizationId;
  final INetworkManager? networkManager;

  const ConversationsScreen({
    super.key,
    required this.currentOrganizationId,
    this.networkManager,
  });

  @override
  State<ConversationsScreen> createState() => _ConversationsScreenState();
}

class _ConversationsScreenState extends State<ConversationsScreen> {
  late final INetworkManager _network;
  final TextEditingController _search = TextEditingController();
  List<ChatConversationModel> _conversations = const [];
  bool _loading = true;
  bool _requestInFlight = false;
  bool _unreadOnly = false;
  String? _error;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _network = widget.networkManager ?? ServiceLocator.network();
    unawaited(_load());
    _timer = Timer.periodic(
      const Duration(seconds: 15),
      (_) => unawaited(_load(silent: true)),
    );
  }

  @override
  void didUpdateWidget(covariant ConversationsScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.currentOrganizationId != widget.currentOrganizationId) {
      setState(() {
        _conversations = const [];
        _loading = true;
        _error = null;
      });
      unawaited(_load());
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _search.dispose();
    super.dispose();
  }

  Future<void> _load({bool silent = false}) async {
    if (_requestInFlight) return;
    _requestInFlight = true;
    final showInitialLoader = !silent && _conversations.isEmpty;
    if (showInitialLoader && mounted) {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final response = await _network.get<Map<String, dynamic>>(
        '/conversations',
      );
      final rows = (response['conversations'] as List<dynamic>? ?? const [])
          .whereType<Map>()
          .map(
            (item) =>
                ChatConversationModel.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList(growable: false);
      if (!mounted) return;
      setState(() {
        _conversations = rows;
        _loading = false;
        _error = null;
      });
    } catch (error) {
      if (!mounted) return;
      if (!silent || _conversations.isEmpty) {
        setState(() {
          _loading = false;
          _error = ErrorHandler.getUserFriendlyMessage(error);
        });
      }
    } finally {
      _requestInFlight = false;
    }
  }

  List<ChatConversationModel> get _visibleConversations {
    final query = _search.text.trim().toLowerCase();
    return _conversations
        .where((conversation) {
          if (_unreadOnly && conversation.unreadCount == 0) return false;
          if (query.isEmpty) return true;
          final title = conversation
              .titleFor(widget.currentOrganizationId)
              .toLowerCase();
          final orderNumber = conversation.orderNumber?.toLowerCase() ?? '';
          final productTitle = conversation.productTitle?.toLowerCase() ?? '';
          final preview = conversation.lastMessage.toLowerCase();
          return title.contains(query) ||
              orderNumber.contains(query) ||
              productTitle.contains(query) ||
              preview.contains(query);
        })
        .toList(growable: false);
  }

  @override
  Widget build(BuildContext context) {
    final conversations = _visibleConversations;
    final unreadTotal = _conversations.fold<int>(
      0,
      (sum, conversation) => sum + (conversation.unreadCount > 0 ? 1 : 0),
    );
    return Scaffold(
      appBar: AppBar(title: const Text('الرسائل والاستفسارات')),
      body: _loading && _conversations.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : _error != null && _conversations.isEmpty
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.wifi_off_rounded,
                    size: 52,
                    color: AppColors.muted,
                  ),
                  const SizedBox(height: 12),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 24),
                    child: Text(_error!, textAlign: TextAlign.center),
                  ),
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: _load,
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('إعادة المحاولة'),
                  ),
                ],
              ),
            )
          : Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 10, 12, 0),
                  child: TextField(
                    controller: _search,
                    onChanged: (_) => setState(() {}),
                    decoration: InputDecoration(
                      labelText: 'البحث في المحادثات',
                      hintText: 'اسم الطرف، المنتج أو رقم الطلب',
                      prefixIcon: const Icon(Icons.search_rounded),
                      suffixIcon: _search.text.isEmpty
                          ? null
                          : IconButton(
                              onPressed: () {
                                _search.clear();
                                setState(() {});
                              },
                              icon: const Icon(Icons.close_rounded),
                              tooltip: 'مسح البحث',
                            ),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 6),
                  child: Row(
                    children: [
                      FilterChip(
                        selected: _unreadOnly,
                        avatar: Icon(
                          _unreadOnly
                              ? Icons.mark_chat_unread
                              : Icons.mark_chat_unread_outlined,
                          size: 17,
                        ),
                        label: Text('غير المقروءة ($unreadTotal)'),
                        onSelected: (value) =>
                            setState(() => _unreadOnly = value),
                      ),
                      const Spacer(),
                      IconButton.outlined(
                        onPressed: () => unawaited(_load(silent: true)),
                        tooltip: 'تحديث المحادثات',
                        icon: const Icon(Icons.refresh_rounded, size: 20),
                      ),
                    ],
                  ),
                ),
                Expanded(child: _buildList(conversations)),
              ],
            ),
    );
  }

  Widget _buildList(List<ChatConversationModel> conversations) {
    if (conversations.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              _search.text.isNotEmpty || _unreadOnly
                  ? Icons.search_off_rounded
                  : Icons.forum_outlined,
              size: 62,
              color: Colors.black26,
            ),
            const SizedBox(height: 12),
            Text(
              _search.text.isNotEmpty || _unreadOnly
                  ? 'لا توجد محادثات مطابقة للبحث'
                  : 'لا توجد رسائل بعد. ابدأ باستفسار من صفحة المنتج أو من تفاصيل الطلب.',
              textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.muted),
            ),
          ],
        ),
      );
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(12, 4, 12, 100),
        itemCount: conversations.length,
        separatorBuilder: (_, _) => const SizedBox(height: 8),
        itemBuilder: (context, index) =>
            _conversationCard(conversations[index]),
      ),
    );
  }

  Widget _conversationCard(ChatConversationModel conversation) {
    final isLocked = !conversation.chatAllowed;
    final date = conversation.lastMessageAt;
    final fallback =
        conversation.orderNumber ?? conversation.productTitle ?? 'استفسار';
    final preview = isLocked
        ? 'تُفتح بعد تأكيد رسوم المنصة'
        : conversation.lastMessage.isEmpty
        ? 'ابدأ المحادثة'
        : conversation.lastMessage;
    final hasUnread = conversation.unreadCount > 0;
    return Semantics(
      label: isLocked
          ? '${conversation.titleFor(widget.currentOrganizationId)}، محادثة مقفلة حتى تأكيد رسوم المنصة'
          : null,
      child: Card(
        margin: EdgeInsets.zero,
        clipBehavior: Clip.antiAlias,
        child: ListTile(
          leading: CircleAvatar(
            backgroundColor: (isLocked ? AppColors.warning : AppColors.primary)
                .withValues(alpha: 0.12),
            child: ExcludeSemantics(
              child: Icon(
                isLocked
                    ? Icons.lock_outline
                    : conversation.conversationType == 'order'
                    ? Icons.receipt_long_outlined
                    : Icons.forum_outlined,
                color: isLocked ? AppColors.warning : AppColors.primary,
              ),
            ),
          ),
          title: Row(
            children: [
              Expanded(
                child: Text(
                  conversation.titleFor(widget.currentOrganizationId),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontWeight: hasUnread ? FontWeight.w800 : FontWeight.w600,
                  ),
                ),
              ),
              if (date != null)
                Text(
                  DateFormat('HH:mm').format(date.toLocal()),
                  style: const TextStyle(fontSize: 11, color: AppColors.muted),
                ),
            ],
          ),
          subtitle: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 2),
              Text(
                fallback,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(fontSize: 11.5, color: AppColors.muted),
              ),
              const SizedBox(height: 2),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      preview,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        color: hasUnread
                            ? AppColors.ink
                            : Theme.of(context).colorScheme.onSurfaceVariant,
                      ),
                    ),
                  ),
                  if (isLocked)
                    const Icon(
                      Icons.lock_outline_rounded,
                      size: 14,
                      color: AppColors.warning,
                    )
                  else if (hasUnread)
                    Semantics(
                      label: '${conversation.unreadCount} رسائل غير مقروءة',
                      child: Container(
                        constraints: const BoxConstraints(
                          minWidth: 21,
                          minHeight: 21,
                        ),
                        padding: const EdgeInsets.symmetric(
                          horizontal: 7,
                          vertical: 3,
                        ),
                        decoration: BoxDecoration(
                          color: AppColors.primary,
                          borderRadius: BorderRadius.circular(99),
                        ),
                        alignment: Alignment.center,
                        child: ExcludeSemantics(
                          child: Text(
                            '${conversation.unreadCount}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ],
          ),
          trailing: Icon(
            Icons.chevron_right_rounded,
            color: Theme.of(context).colorScheme.outline,
          ),
          onTap: () async {
            if (isLocked) {
              ErrorHandler.showSecureSnackBar(
                context,
                'يجب تأكيد رسوم المنصة أولًا من تفاصيل الطلب.',
                isError: true,
              );
              return;
            }
            await Navigator.of(context).push(
              MaterialPageRoute(
                builder: (_) => ConversationChatScreen(
                  conversationId: conversation.id,
                  title: conversation.titleFor(widget.currentOrganizationId),
                  currentOrganizationId: widget.currentOrganizationId,
                  networkManager: widget.networkManager,
                ),
              ),
            );
            if (mounted) unawaited(_load(silent: true));
          },
        ),
      ),
    );
  }
}

class ConversationChatScreen extends StatefulWidget {
  final String conversationId;
  final String title;
  final String currentOrganizationId;
  final List<ChatMessageModel> initialMessages;
  final INetworkManager? networkManager;
  final Duration pollInterval;

  const ConversationChatScreen({
    super.key,
    required this.conversationId,
    required this.title,
    required this.currentOrganizationId,
    this.initialMessages = const [],
    this.networkManager,
    this.pollInterval = const Duration(seconds: 5),
  });

  @override
  State<ConversationChatScreen> createState() => _ConversationChatScreenState();
}

class _ConversationChatScreenState extends State<ConversationChatScreen>
    with WidgetsBindingObserver {
  late final INetworkManager _network;
  final _message = TextEditingController();
  final _scroll = ScrollController();
  List<ChatMessageModel> _messages = const [];
  bool _loading = true;
  bool _requestInFlight = false;
  bool _loadingOlder = false;
  bool _hasMoreHistory = false;
  bool _appActive = true;
  DateTime? _oldestCursorAt;
  String? _oldestCursorId;
  String? _loadError;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _network = widget.networkManager ?? ServiceLocator.network();
    _messages = List<ChatMessageModel>.from(widget.initialMessages);
    _loading = _messages.isEmpty;
    _scroll.addListener(_onScroll);
    final lifecycleState = WidgetsBinding.instance.lifecycleState;
    _appActive =
        lifecycleState == null || lifecycleState == AppLifecycleState.resumed;
    unawaited(_load(silent: _messages.isNotEmpty));
    _timer = Timer.periodic(widget.pollInterval, (_) => _poll());
    if (_messages.isNotEmpty) _scheduleScrollToBottom(force: true);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _appActive = state == AppLifecycleState.resumed;
    if (_appActive && mounted) _poll();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _timer?.cancel();
    _message.dispose();
    _scroll.removeListener(_onScroll);
    _scroll.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scroll.hasClients) return;
    if (_scroll.position.pixels < 160 &&
        _hasMoreHistory &&
        !_loadingOlder &&
        !_loading) {
      unawaited(_loadOlder());
    }
  }

  void _poll() {
    if (!mounted || !_appActive) return;
    final route = ModalRoute.of(context);
    if (route != null && !route.isCurrent) return;
    unawaited(_load(silent: true));
  }

  ChatMessageModel? get _latestPersistedMessage {
    for (var index = _messages.length - 1; index >= 0; index--) {
      final message = _messages[index];
      if (message.isPersisted) return message;
    }
    return null;
  }

  ChatMessageModel? get _oldestPersistedMessage {
    for (final message in _messages) {
      if (message.isPersisted) return message;
    }
    return null;
  }

  Future<void> _load({bool silent = false}) async {
    if (_requestInFlight) return;
    _requestInFlight = true;
    final cursor = _latestPersistedMessage;
    final query = cursor == null
        ? null
        : <String, dynamic>{
            'after': cursor.createdAt.toUtc().toIso8601String(),
            'after_id': cursor.id,
          };
    try {
      final response = await _network.get<Map<String, dynamic>>(
        '/conversations/${widget.conversationId}/messages',
        queryParameters: query,
      );
      final incoming = (response['messages'] as List<dynamic>? ?? const [])
          .whereType<Map>()
          .map(
            (item) =>
                ChatMessageModel.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList(growable: false);
      if (!mounted) return;
      final shouldAutoScroll = _isNearBottom;
      setState(() {
        _messages = _mergeMessages(_messages, incoming);
        _loading = false;
        _loadError = null;
        if (cursor == null) {
          _applyHistoryPage(response);
        } else if (_oldestCursorAt == null) {
          _applyHistoryPage(response);
        }
      });
      if (incoming.isNotEmpty && shouldAutoScroll) {
        _scheduleScrollToBottom();
      }
    } catch (error) {
      if (!mounted) return;
      if (!silent || _messages.isEmpty) {
        setState(() {
          _loading = false;
          _loadError = ErrorHandler.getUserFriendlyMessage(error);
        });
      }
    } finally {
      _requestInFlight = false;
    }
  }

  void _applyHistoryPage(Map<String, dynamic> response) {
    final page = response['page'] is Map
        ? Map<String, dynamic>.from(response['page'] as Map)
        : const <String, dynamic>{};
    _hasMoreHistory = page['has_more'] == true;
    final oldest = page['oldest_cursor'] is Map
        ? Map<String, dynamic>.from(page['oldest_cursor'] as Map)
        : null;
    if (oldest != null) {
      _oldestCursorAt = DateTime.tryParse(
        oldest['created_at']?.toString() ?? '',
      );
      _oldestCursorId = oldest['id']?.toString();
    }
  }

  Future<void> _loadOlder() async {
    if (_loadingOlder || !_hasMoreHistory || _requestInFlight) return;
    final anchorAt = _oldestCursorAt ?? _oldestPersistedMessage?.createdAt;
    final anchorId = _oldestCursorId ?? _oldestPersistedMessage?.id;
    if (anchorAt == null || anchorId == null) return;
    setState(() => _loadingOlder = true);
    try {
      final response = await _network.get<Map<String, dynamic>>(
        '/conversations/${widget.conversationId}/messages',
        queryParameters: {
          'before': anchorAt.toUtc().toIso8601String(),
          'before_id': anchorId,
        },
      );
      final incoming = (response['messages'] as List<dynamic>? ?? const [])
          .whereType<Map>()
          .map(
            (item) =>
                ChatMessageModel.fromJson(Map<String, dynamic>.from(item)),
          )
          .toList(growable: false);
      if (!mounted) return;
      final previousMaxExtent = _scroll.hasClients
          ? _scroll.position.maxScrollExtent
          : 0.0;
      final previousOffset = _scroll.hasClients ? _scroll.position.pixels : 0.0;
      setState(() {
        _messages = _mergeMessages(_messages, incoming);
        _applyHistoryPage(response);
        _loadingOlder = false;
      });
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !_scroll.hasClients) return;
        final delta = _scroll.position.maxScrollExtent - previousMaxExtent;
        if (delta > 0) _scroll.jumpTo(previousOffset + delta);
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _loadingOlder = false);
      ErrorHandler.showSecureSnackBar(
        context,
        ErrorHandler.getUserFriendlyMessage(error),
        isError: true,
      );
    }
  }

  Future<void> _send() async {
    final body = _message.text.trim();
    if (body.isEmpty) return;
    final clientMessageId = createClientMessageId();
    final optimistic = ChatMessageModel.optimistic(
      clientMessageId: clientMessageId,
      senderOrganizationId: widget.currentOrganizationId,
      body: body,
      createdAt: DateTime.now().toUtc(),
    );
    _message.clear();
    setState(() {
      _messages = _mergeMessages(_messages, [optimistic]);
    });
    _scheduleScrollToBottom(force: true);
    await _submitMessage(optimistic);
  }

  Future<void> _retry(ChatMessageModel failedMessage) async {
    if (failedMessage.clientMessageId == null ||
        failedMessage.deliveryState != ChatDeliveryState.failed) {
      return;
    }
    setState(() {
      _messages = _messages
          .map(
            (message) =>
                message.clientMessageId == failedMessage.clientMessageId
                ? message.copyWith(deliveryState: ChatDeliveryState.sending)
                : message,
          )
          .toList(growable: false);
    });
    await _submitMessage(
      failedMessage.copyWith(deliveryState: ChatDeliveryState.sending),
    );
  }

  Future<void> _submitMessage(ChatMessageModel localMessage) async {
    try {
      final response = await _network.post<Map<String, dynamic>>(
        '/conversations/${widget.conversationId}/messages',
        data: {
          'body': localMessage.body,
          'client_message_id': localMessage.clientMessageId,
        },
      );
      final rawMessage = response['message'];
      if (rawMessage is! Map) {
        throw StateError('Message response is missing the persisted message');
      }
      final persisted = ChatMessageModel.fromJson(
        Map<String, dynamic>.from(rawMessage),
      );
      if (!mounted) return;
      setState(() {
        _messages = _mergeMessages(_messages, [persisted]);
      });
      _scheduleScrollToBottom();
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _messages = _messages
            .map(
              (message) =>
                  message.clientMessageId == localMessage.clientMessageId
                  ? message.copyWith(deliveryState: ChatDeliveryState.failed)
                  : message,
            )
            .toList(growable: false);
      });
      ErrorHandler.showSecureSnackBar(
        context,
        '${ErrorHandler.getUserFriendlyMessage(error)} يمكنك إعادة إرسال الرسالة.',
        isError: true,
      );
    }
  }

  List<ChatMessageModel> _mergeMessages(
    List<ChatMessageModel> current,
    Iterable<ChatMessageModel> incoming,
  ) {
    final result = List<ChatMessageModel>.from(current);
    for (final candidate in incoming) {
      final index = result.indexWhere(
        (message) =>
            (candidate.id.isNotEmpty && message.id == candidate.id) ||
            (candidate.clientMessageId != null &&
                message.clientMessageId == candidate.clientMessageId),
      );
      if (index >= 0) {
        result[index] = candidate;
      } else {
        result.add(candidate);
      }
    }
    result.sort((left, right) {
      final byTime = left.createdAt.compareTo(right.createdAt);
      return byTime != 0 ? byTime : left.id.compareTo(right.id);
    });
    return List<ChatMessageModel>.unmodifiable(result);
  }

  bool get _isNearBottom {
    if (!_scroll.hasClients) return true;
    return _scroll.position.maxScrollExtent - _scroll.position.pixels < 120;
  }

  void _scheduleScrollToBottom({bool force = false}) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scroll.hasClients) return;
      if (!force && !_isNearBottom) return;
      _scroll.animateTo(
        _scroll.position.maxScrollExtent,
        duration: const Duration(milliseconds: 180),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.title, maxLines: 1, overflow: TextOverflow.ellipsis),
      ),
      body: Column(
        children: [
          if (_loadingOlder) const LinearProgressIndicator(minHeight: 2),
          Expanded(child: _buildMessages()),
          SafeArea(top: false, child: _buildComposer()),
        ],
      ),
    );
  }

  Widget _buildComposer() {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
      child: Container(
        padding: const EdgeInsets.fromLTRB(6, 4, 6, 4),
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(26),
          border: Border.all(color: AppColors.border),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: TextField(
                controller: _message,
                minLines: 1,
                maxLines: 4,
                maxLength: 3000,
                textInputAction: TextInputAction.newline,
                onSubmitted: (_) => unawaited(_send()),
                decoration: const InputDecoration(
                  labelText: 'الرسالة',
                  hintText: 'اكتب رسالتك...',
                  counterText: '',
                  border: InputBorder.none,
                  enabledBorder: InputBorder.none,
                  focusedBorder: InputBorder.none,
                  filled: false,
                  contentPadding: EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 12,
                  ),
                ),
              ),
            ),
            ValueListenableBuilder<TextEditingValue>(
              valueListenable: _message,
              builder: (context, value, _) {
                final canSend = value.text.trim().isNotEmpty;
                return IconButton.filled(
                  onPressed: canSend ? () => unawaited(_send()) : null,
                  tooltip: 'إرسال الرسالة',
                  icon: AnimatedSwitcher(
                    duration: const Duration(milliseconds: 150),
                    child: Icon(
                      Icons.send_rounded,
                      key: ValueKey(canSend),
                      size: 20,
                    ),
                  ),
                );
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMessages() {
    if (_loading && _messages.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_loadError != null && _messages.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.wifi_off_rounded,
              size: 52,
              color: AppColors.muted,
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Text(_loadError!, textAlign: TextAlign.center),
            ),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _load,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('إعادة المحاولة'),
            ),
          ],
        ),
      );
    }
    if (_messages.isEmpty) {
      return const Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.chat_bubble_outline_rounded,
              size: 56,
              color: Colors.black26,
            ),
            SizedBox(height: 12),
            Text('ابدأ المحادثة بإرسال أول رسالة.'),
          ],
        ),
      );
    }
    return ListView.builder(
      controller: _scroll,
      padding: const EdgeInsets.all(14),
      itemCount: _messages.length + (_hasMoreHistory ? 1 : 0),
      itemBuilder: (context, index) {
        if (index == 0 && _hasMoreHistory) {
          return _historyHeader();
        }
        final messageIndex = _hasMoreHistory ? index - 1 : index;
        return _buildMessage(_messages[messageIndex]);
      },
    );
  }

  Widget _historyHeader() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Center(
        child: _loadingOlder
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : TextButton.icon(
                onPressed: () => unawaited(_loadOlder()),
                icon: const Icon(Icons.history_rounded, size: 18),
                label: const Text('تحميل الرسائل الأقدم'),
              ),
      ),
    );
  }

  Widget _buildMessage(ChatMessageModel message) {
    final isMine = message.senderOrganizationId == widget.currentOrganizationId;
    final date = message.createdAt.millisecondsSinceEpoch == 0
        ? null
        : message.createdAt;
    if (message.isSystem) {
      return Semantics(
        container: true,
        label: 'تحديث للطلب: ${message.body}',
        child: Container(
          width: double.infinity,
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            color: const Color(0xFFFFF7E6),
            border: Border.all(color: const Color(0xFFF4D7A1)),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              ExcludeSemantics(
                child: Icon(
                  _systemEventIcon(message.eventType),
                  size: 19,
                  color: const Color(0xFFB45309),
                ),
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      message.body,
                      style: const TextStyle(
                        fontWeight: FontWeight.w600,
                        color: Color(0xFF78350F),
                      ),
                    ),
                    if (date != null)
                      Text(
                        DateFormat('dd/MM HH:mm').format(date.toLocal()),
                        style: const TextStyle(
                          fontSize: 11,
                          color: Color(0xFF78350F),
                        ),
                      ),
                  ],
                ),
              ),
            ],
          ),
        ),
      );
    }

    final failed = message.deliveryState == ChatDeliveryState.failed;
    final bubbleColor = failed
        ? const Color(0xFFFEF2F2)
        : isMine
        ? AppColors.primary
        : const Color(0xFFE2E8F0);
    final foreground = failed
        ? const Color(0xFF991B1B)
        : isMine
        ? Colors.white
        : const Color(0xFF0F172A);
    final senderLabel = isMine
        ? 'أنت'
        : message.senderDisplayName.isEmpty
        ? 'الطرف الآخر'
        : message.senderDisplayName;
    final deliveryLabel = switch (message.deliveryState) {
      ChatDeliveryState.sending => 'قيد الإرسال',
      ChatDeliveryState.sent => 'تم الإرسال',
      ChatDeliveryState.failed => 'فشل الإرسال',
    };
    return Semantics(
      container: true,
      label: 'رسالة من $senderLabel، ${message.body}، $deliveryLabel',
      child: Align(
        alignment: isMine
            ? AlignmentDirectional.centerEnd
            : AlignmentDirectional.centerStart,
        child: Container(
          constraints: const BoxConstraints(maxWidth: 340),
          margin: const EdgeInsets.only(bottom: 8),
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: BoxDecoration(
            color: bubbleColor,
            border: failed ? Border.all(color: const Color(0xFFFCA5A5)) : null,
            borderRadius: BorderRadiusDirectional.only(
              topStart: Radius.circular(16),
              topEnd: Radius.circular(16),
              bottomStart: isMine
                  ? const Radius.circular(16)
                  : const Radius.circular(4),
              bottomEnd: isMine
                  ? const Radius.circular(4)
                  : const Radius.circular(16),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (!isMine)
                Text(
                  message.senderDisplayName,
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: foreground.withValues(alpha: 0.75),
                  ),
                ),
              Text(message.body, style: TextStyle(color: foreground)),
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (date != null)
                    Text(
                      DateFormat('HH:mm').format(date.toLocal()),
                      style: TextStyle(
                        fontSize: 11,
                        color: failed
                            ? const Color(0xFF991B1B)
                            : isMine
                            ? Colors.white70
                            : const Color(0xFF475569),
                      ),
                    ),
                  if (isMine) ...[
                    const SizedBox(width: 5),
                    if (message.deliveryState == ChatDeliveryState.sending)
                      const Icon(
                        Icons.schedule_rounded,
                        size: 15,
                        color: Colors.white,
                        semanticLabel: 'قيد الإرسال',
                      )
                    else if (message.deliveryState == ChatDeliveryState.sent)
                      const Icon(
                        Icons.check_rounded,
                        size: 15,
                        color: Colors.white,
                        semanticLabel: 'تم الإرسال',
                      )
                    else
                      IconButton(
                        onPressed: () => unawaited(_retry(message)),
                        tooltip: 'إعادة إرسال الرسالة',
                        visualDensity: VisualDensity.compact,
                        icon: const Icon(
                          Icons.refresh_rounded,
                          color: Color(0xFF991B1B),
                        ),
                      ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  IconData _systemEventIcon(String? eventType) {
    if (eventType?.startsWith('payment_') == true ||
        eventType == 'all_payments_confirmed') {
      return Icons.payments_outlined;
    }
    if (eventType?.startsWith('tracking_') == true ||
        eventType == 'shipment_started' ||
        eventType == 'shipment_delivered') {
      return Icons.local_shipping_outlined;
    }
    if (eventType?.startsWith('dispute_') == true) {
      return Icons.gavel_outlined;
    }
    if (eventType == 'order_accepted' || eventType == 'buyer_received') {
      return Icons.task_alt_rounded;
    }
    if (eventType == 'order_rejected' || eventType == 'order_canceled') {
      return Icons.cancel_outlined;
    }
    return Icons.info_outline;
  }
}
